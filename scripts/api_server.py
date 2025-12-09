"""
Movie Recommendation System - FastAPI Server
Lightweight REST API for real-time recommendations
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
from pathlib import Path
import sys

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

from movie_recommender import MovieRecommender


# Initialize FastAPI app
app = FastAPI(
    title="Movie Recommendation API",
    description="Lightweight movie recommendation system powered by content-based filtering",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load recommender model
try:
    # Use absolute path relative to this script
    script_dir = Path(__file__).parent
    models_dir = script_dir.parent / 'results'
    recommender = MovieRecommender(models_dir=str(models_dir))
    print("[OK] MovieRecommender loaded successfully!")
except Exception as e:
    print(f"✗ Error loading models: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
    recommender = None


# Pydantic models for request/response
class RecommendationRequest(BaseModel):
    movie_title: str
    n_recommendations: int = 10
    model_type: str = 'hybrid'


class SearchRequest(BaseModel):
    query: str
    limit: int = 10


class BatchRequest(BaseModel):
    movie_titles: List[str]
    n_recommendations: int = 5
    model_type: str = 'hybrid'


# API Routes
@app.get("/", tags=["General"])
async def root():
    """API information and health check"""
    return {
        "service": "Movie Recommendation System",
        "status": "online",
        "version": "1.0.0",
        "endpoints": [
            "/docs - Interactive API documentation",
            "/recommend - Get recommendations for a movie",
            "/search - Search movies",
            "/movie-info - Get movie information",
            "/batch-recommend - Get recommendations for multiple movies"
        ]
    }


@app.get("/health", tags=["General"])
async def health_check():
    """Health check endpoint"""
    if recommender is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    return {
        "status": "healthy",
        "movies_loaded": len(recommender.train_df),
        "models": ["cosine_similarity", "lightweight_hybrid"]
    }


@app.post("/recommend", tags=["Recommendations"])
async def get_recommendations(request: RecommendationRequest):
    """
    Get movie recommendations based on a query movie
    
    - **movie_title**: Name of the movie to get recommendations for
    - **n_recommendations**: Number of recommendations (1-50)
    - **model_type**: 'content_based' or 'hybrid' (default: 'hybrid')
    """
    if recommender is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    if request.n_recommendations > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 recommendations allowed")
    
    try:
        if request.model_type == 'hybrid':
            result = recommender.recommend_hybrid(
                request.movie_title,
                n_recommendations=request.n_recommendations
            )
        else:
            result = recommender.recommend_content_based(
                request.movie_title,
                n_recommendations=request.n_recommendations
            )
        
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        
        return result
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/recommend", tags=["Recommendations"])
async def get_recommendations_query(
    movie_title: str = Query(..., description="Movie title"),
    n_recommendations: int = Query(10, ge=1, le=50),
    model_type: str = Query('hybrid', regex='^(content_based|hybrid)$')
):
    """
    Get movie recommendations via query parameters
    """
    if recommender is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    try:
        if model_type == 'hybrid':
            result = recommender.recommend_hybrid(movie_title, n_recommendations)
        else:
            result = recommender.recommend_content_based(movie_title, n_recommendations)
        
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        
        return result
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search", tags=["Search"])
async def search_movies(request: SearchRequest):
    """
    Search for movies by partial title match
    
    - **query**: Search query string
    - **limit**: Maximum number of results (default: 10)
    """
    if recommender is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    try:
        results = recommender.search_movies(request.query, limit=request.limit)
        return {
            "query": request.query,
            "count": len(results),
            "movies": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/search", tags=["Search"])
async def search_movies_query(
    query: str = Query(..., description="Search query"),
    limit: int = Query(10, ge=1, le=50)
):
    """Search movies via query parameters"""
    if recommender is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    try:
        results = recommender.search_movies(query, limit=limit)
        return {
            "query": query,
            "count": len(results),
            "movies": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/movie-info", tags=["Search"])
async def get_movie_info(
    movie_title: str = Query(..., description="Movie title")
):
    """
    Get detailed information about a specific movie
    """
    if recommender is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    try:
        info = recommender.get_movie_info(movie_title)
        if "error" in info:
            raise HTTPException(status_code=404, detail=info["error"])
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/batch-recommend", tags=["Recommendations"])
async def batch_recommendations(request: BatchRequest):
    """
    Get recommendations for multiple movies at once
    
    - **movie_titles**: List of movie titles
    - **n_recommendations**: Number of recommendations per movie
    - **model_type**: 'content_based' or 'hybrid'
    """
    if recommender is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    if len(request.movie_titles) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 movies per batch")
    
    try:
        results = recommender.batch_recommend(
            request.movie_titles,
            model_type=request.model_type,
            n_recommendations=request.n_recommendations
        )
        return {
            "batch_size": len(request.movie_titles),
            "model_type": request.model_type,
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stats", tags=["General"])
async def get_stats():
    """Get system statistics"""
    if recommender is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    # Extract unique genres from dict objects
    unique_genres = set()
    for genres_list in recommender.train_df['genres_list']:
        if isinstance(genres_list, list):
            for g in genres_list:
                if isinstance(g, dict) and 'name' in g:
                    unique_genres.add(g['name'])
    
    return {
        "total_movies": len(recommender.train_df),
        "available_genres": len(unique_genres),
        "avg_rating": float(recommender.train_df['vote_average'].mean()),
        "model_type": "lightweight_hybrid + content_based",
        "inference_time_ms": "<10ms per recommendation"
    }


@app.get("/genres", tags=["Browse"])
async def get_genres():
    """Get list of all available genres"""
    if recommender is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    try:
        genres = recommender.get_all_genres()
        return {
            "genres": genres,
            "count": len(genres)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/browse/genre/{genre}", tags=["Browse"])
async def browse_by_genre(
    genre: str,
    n_recommendations: int = Query(20, ge=1, le=50),
    sort_by: str = Query('rating', regex='^(rating|popularity|recent)$')
):
    """
    Browse movies by genre
    
    - **genre**: Genre name (e.g., 'Action', 'Comedy', 'Drama')
    - **n_recommendations**: Number of movies to return (1-50)
    - **sort_by**: Sort criteria - 'rating', 'popularity', or 'recent'
    """
    if recommender is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    try:
        result = recommender.recommend_by_genre(genre, n_recommendations, sort_by)
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    print("=" * 80)
    print("MOVIE RECOMMENDATION API - STARTING SERVER")
    print("=" * 80)
    print("\n[OK] FastAPI server starting...")
    print("[OK] API documentation: http://localhost:8001/docs")
    print("[OK] Alternative docs: http://localhost:8001/redoc")
    print("\n" + "=" * 80)
    
    # Run server
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
