"""
Movie Recommendation System - Inference Engine
Fast, lightweight recommendation engine for movies
"""

import pickle
import numpy as np
import pandas as pd
import os
from typing import List, Tuple, Dict
import json
from pathlib import Path


class MovieRecommender:
    """Lightweight movie recommendation engine"""
    
    def __init__(self, models_dir='results'):
        """
        Initialize the recommender with pre-trained models
        
        Args:
            models_dir: Directory containing saved model files
        """
        # Handle relative paths
        if not os.path.isabs(models_dir):
            # If path starts with ../, resolve it relative to current working directory
            if models_dir.startswith('../') or models_dir.startswith('..\\'):
                self.models_dir = os.path.normpath(os.path.abspath(models_dir))
            else:
                # Otherwise resolve relative to script directory
                script_dir = os.path.dirname(os.path.abspath(__file__))
                self.models_dir = os.path.normpath(os.path.join(os.path.dirname(script_dir), models_dir))
        else:
            self.models_dir = os.path.normpath(models_dir)
        self.load_models()
        
    def load_models(self):
        """Load all pre-trained models and data"""
        try:
            # Load preprocessed data
            with open(os.path.join(self.models_dir, 'preprocessed_data.pkl'), 'rb') as f:
                preprocess_data = pickle.load(f)
            
            self.train_df = preprocess_data['train_df']
            
            # Try to load improved models first, fallback to original
            try:
                with open(os.path.join(self.models_dir, 'content_based_models_improved.pkl'), 'rb') as f:
                    content_models = pickle.load(f)
                print("[OK] Using IMPROVED models!")
            except FileNotFoundError:
                with open(os.path.join(self.models_dir, 'content_based_models.pkl'), 'rb') as f:
                    content_models = pickle.load(f)
                print("[OK] Using original models")
            
            self.similarity_matrix = content_models['similarity_matrix_cosine']
            
            # Load hybrid model (improved or original)
            try:
                with open(os.path.join(self.models_dir, 'hybrid_model_improved.pkl'), 'rb') as f:
                    hybrid_model = pickle.load(f)
            except FileNotFoundError:
                with open(os.path.join(self.models_dir, 'hybrid_model_lightweight.pkl'), 'rb') as f:
                    hybrid_model = pickle.load(f)
            
            self.hybrid_model = hybrid_model
            
            print(f"  - Movies available: {len(self.train_df)}")
            print(f"  - Similarity matrix: {self.similarity_matrix.shape}")
            
        except FileNotFoundError as e:
            print(f"✗ Error loading models: {e}")
            raise
        
        self.hybrid_weights = hybrid_model['weights']
        self.movie_titles = self.train_df['title'].values
        self.movie_ids = self.train_df.index.values
        
        # Use pre-computed scaled values if available, otherwise compute
        if 'popularity_scaled' in hybrid_model and 'rating_scaled' in hybrid_model:
            self.popularity_scaled = hybrid_model['popularity_scaled']
            self.rating_scaled = hybrid_model['rating_scaled']
        else:
            # Compute scaled popularity and rating scores for hybrid model
            popularity = self.train_df['popularity'].values
            rating = self.train_df['vote_average'].values
            
            # Scale to [0, 1]
            self.popularity_scaled = (popularity - popularity.min()) / (popularity.max() - popularity.min() + 1e-8)
            self.rating_scaled = (rating - rating.min()) / (rating.max() - rating.min() + 1e-8)
        
        print(f"[OK] Loaded {len(self.train_df)} movies")
    
    def get_movie_by_title(self, title):
        """Find movie index by title (fuzzy match)"""
        title_lower = title.lower()
        
        # Exact match first
        for idx, movie_title in enumerate(self.movie_titles):
            if movie_title.lower() == title_lower:
                return idx
        
        # Partial match
        for idx, movie_title in enumerate(self.movie_titles):
            if title_lower in movie_title.lower():
                return idx
        
        return None
    
    def recommend_content_based(self, movie_title, n_recommendations=10):
        """
        Get recommendations using content-based filtering
        
        Args:
            movie_title: Name of the movie to get recommendations for
            n_recommendations: Number of recommendations to return
        
        Returns:
            List of (movie_title, similarity_score, rating) tuples
        """
        movie_idx = self.get_movie_by_title(movie_title)
        
        if movie_idx is None:
            return {"error": f"Movie '{movie_title}' not found"}
        
        # Get similarity scores
        scores = self.similarity_matrix[movie_idx]
        
        # Exclude the movie itself
        scores_copy = scores.copy()
        scores_copy[movie_idx] = -1
        
        # Get top N recommendations
        top_indices = np.argsort(scores_copy)[::-1][:n_recommendations]
        
        recommendations = []
        for idx in top_indices:
            movie_id = int(self.train_df.iloc[idx]['movie_id'])
            title = self.movie_titles[idx]
            year = int(self.train_df.iloc[idx]['release_year']) if 'release_year' in self.train_df.columns else ''
            overview = self.train_df.iloc[idx]['overview'] if 'overview' in self.train_df.columns else ''
            
            recommendations.append({
                'title': title,
                'movie_id': movie_id,
                'year': year,
                'overview': overview,
                'poster_url': f'https://img.omdbapi.com/?i=tt{movie_id}&apikey=placeholder',
                'similarity_score': float(scores[idx]),
                'rating': float(self.train_df.iloc[idx]['vote_average']),
                'popularity': float(self.train_df.iloc[idx]['popularity']),
                'genres': self.train_df.iloc[idx]['genres_list']
            })
        
        return {
            'query_movie': movie_title,
            'recommendations': recommendations,
            'model_type': 'content_based'
        }
    
    def recommend_hybrid(self, movie_title, n_recommendations=10):
        """
        Get recommendations using lightweight hybrid model
        Combines content similarity with popularity and rating boost
        
        Args:
            movie_title: Name of the movie to get recommendations for
            n_recommendations: Number of recommendations to return
        
        Returns:
            List of recommendations with hybrid scores
        """
        movie_idx = self.get_movie_by_title(movie_title)
        
        if movie_idx is None:
            return {"error": f"Movie '{movie_title}' not found"}
        
        # Get content similarity
        content_scores = self.similarity_matrix[movie_idx]
        
        # Handle different weight structures (old vs new model)
        if 'ensemble' in self.hybrid_weights:
            # New ultra model
            hybrid_scores = (
                self.hybrid_weights['ensemble'] * content_scores +
                self.hybrid_weights['popularity'] * self.popularity_scaled +
                self.hybrid_weights['rating'] * self.rating_scaled
            )
        else:
            # Old model
            hybrid_scores = (
                self.hybrid_weights.get('content', 0.6) * content_scores +
                self.hybrid_weights.get('popularity', 0.2) * self.popularity_scaled +
                self.hybrid_weights.get('rating', 0.2) * self.rating_scaled
            )
        
        # Exclude the movie itself
        hybrid_scores[movie_idx] = -1
        
        # Get top N recommendations
        top_indices = np.argsort(hybrid_scores)[::-1][:n_recommendations]
        
        recommendations = []
        for idx in top_indices:
            movie_id = int(self.train_df.iloc[idx]['movie_id'])
            title = self.movie_titles[idx]
            year = int(self.train_df.iloc[idx]['release_year']) if 'release_year' in self.train_df.columns else ''
            overview = self.train_df.iloc[idx]['overview'] if 'overview' in self.train_df.columns else ''
            
            recommendations.append({
                'title': title,
                'movie_id': movie_id,
                'year': year,
                'overview': overview,
                'poster_url': f'https://img.omdbapi.com/?i=tt{movie_id}&apikey=placeholder',
                'hybrid_score': float(hybrid_scores[idx]),
                'content_similarity': float(content_scores[idx]),
                'rating': float(self.train_df.iloc[idx]['vote_average']),
                'popularity': float(self.train_df.iloc[idx]['popularity']),
                'genres': self.train_df.iloc[idx]['genres_list']
            })
        
        return {
            'query_movie': movie_title,
            'recommendations': recommendations,
            'model_type': 'lightweight_hybrid',
            'weights': self.hybrid_weights
        }
    
    def batch_recommend(self, movie_titles, model_type='hybrid', n_recommendations=5):
        """
        Get recommendations for multiple movies
        
        Args:
            movie_titles: List of movie titles
            model_type: 'content_based' or 'hybrid'
            n_recommendations: Number of recommendations per movie
        
        Returns:
            Dictionary with recommendations for each movie
        """
        results = {}
        
        for movie_title in movie_titles:
            if model_type == 'hybrid':
                results[movie_title] = self.recommend_hybrid(
                    movie_title, n_recommendations
                )
            else:
                results[movie_title] = self.recommend_content_based(
                    movie_title, n_recommendations
                )
        
        return results
    
    def get_all_genres(self):
        """Get list of all unique genres"""
        genres = set()
        for genres_list in self.train_df['genres_list']:
            if isinstance(genres_list, list):
                for g in genres_list:
                    if isinstance(g, dict) and 'name' in g:
                        genres.add(g['name'])
        return sorted(list(genres))
    
    def recommend_by_genre(self, genre, n_recommendations=20, sort_by='rating'):
        """
        Get top movies by genre
        
        Args:
            genre: Genre name (e.g., 'Action', 'Comedy')
            n_recommendations: Number of movies to return
            sort_by: 'rating', 'popularity', or 'recent'
        
        Returns:
            Dictionary with genre recommendations
        """
        # Filter movies by genre
        genre_movies = []
        
        for idx, row in self.train_df.iterrows():
            genres_list = row['genres_list']
            if isinstance(genres_list, list):
                genre_names = [g['name'] if isinstance(g, dict) else g for g in genres_list]
                if genre in genre_names:
                    genre_movies.append(idx)
        
        if not genre_movies:
            return {'error': f'No movies found for genre: {genre}'}
        
        # Create DataFrame of genre movies
        genre_df = self.train_df.iloc[genre_movies].copy()
        
        # Sort based on criteria
        if sort_by == 'rating':
            # Sort by rating, but require minimum vote count
            genre_df = genre_df[genre_df['vote_count'] >= 50]
            genre_df = genre_df.sort_values('vote_average', ascending=False)
        elif sort_by == 'popularity':
            genre_df = genre_df.sort_values('popularity', ascending=False)
        elif sort_by == 'recent':
            if 'release_year' in genre_df.columns:
                genre_df = genre_df.sort_values('release_year', ascending=False)
        
        # Get top N
        top_movies = genre_df.head(n_recommendations)
        
        recommendations = []
        for idx, row in top_movies.iterrows():
            movie_id = int(row['movie_id'])
            title = row['title']
            year = int(row['release_year']) if 'release_year' in row else ''
            overview = row['overview'] if 'overview' in row else ''
            
            recommendations.append({
                'title': title,
                'movie_id': movie_id,
                'year': year,
                'overview': overview,
                'rating': float(row['vote_average']),
                'popularity': float(row['popularity']),
                'genres': row['genres_list']
            })
        
        return {
            'genre': genre,
            'recommendations': recommendations,
            'total_found': len(genre_movies),
            'sort_by': sort_by
        }
    
    def get_movie_info(self, movie_title):
        """Get detailed information about a movie"""
        movie_idx = self.get_movie_by_title(movie_title)
        
        if movie_idx is None:
            return {"error": f"Movie '{movie_title}' not found"}
        
        movie = self.train_df.iloc[movie_idx]
        
        # Extract genre names
        genres = []
        if isinstance(movie['genres_list'], list):
            for g in movie['genres_list']:
                if isinstance(g, dict) and 'name' in g:
                    genres.append(g['name'])
        
        return {
            'title': movie['title'],
            'movie_id': int(movie['movie_id']),
            'year': int(movie['release_year']),
            'rating': float(movie['vote_average']),
            'popularity': float(movie['popularity']),
            'genres': genres,
            'overview': movie['overview'][:200] + '...' if len(movie['overview']) > 200 else movie['overview']
        }
    
    def search_movies(self, query, limit=10):
        """Search for movies by partial title match"""
        query_lower = query.lower()
        matches = []
        
        for idx, title in enumerate(self.movie_titles):
            if query_lower in title.lower():
                matches.append({
                    'title': title,
                    'movie_id': int(self.movie_ids[idx]),
                    'rating': float(self.train_df.iloc[idx]['vote_average'])
                })
        
        return sorted(matches, key=lambda x: x['rating'], reverse=True)[:limit]


# Example usage and testing
if __name__ == "__main__":
    import time
    
    print("=" * 80)
    print("MOVIE RECOMMENDATION SYSTEM - INFERENCE TEST")
    print("=" * 80)
    
    # Initialize recommender
    recommender = MovieRecommender()
    
    # Get some test movies
    test_movies = recommender.movie_titles[:5]
    
    print(f"\n[OK] Using {len(recommender.train_df)} movies in database")
    
    # Test 1: Content-based recommendation
    print("\n--- TEST 1: Content-Based Recommendations ---")
    test_movie = test_movies[0]
    print(f"\nQuery: {test_movie}")
    
    start_time = time.time()
    result = recommender.recommend_content_based(test_movie, n_recommendations=5)
    inference_time = time.time() - start_time
    
    print(f"Inference time: {inference_time*1000:.2f}ms")
    print("\nTop 5 Recommendations:")
    for i, rec in enumerate(result['recommendations'], 1):
        print(f"  {i}. {rec['title']} (Score: {rec['similarity_score']:.4f}, Rating: {rec['rating']:.1f})")
    
    # Test 2: Hybrid recommendation
    print("\n--- TEST 2: Hybrid Model Recommendations ---")
    print(f"\nQuery: {test_movie}")
    
    start_time = time.time()
    result = recommender.recommend_hybrid(test_movie, n_recommendations=5)
    inference_time = time.time() - start_time
    
    print(f"Inference time: {inference_time*1000:.2f}ms")
    print("\nTop 5 Recommendations:")
    for i, rec in enumerate(result['recommendations'], 1):
        print(f"  {i}. {rec['title']} (Score: {rec['hybrid_score']:.4f}, Rating: {rec['rating']:.1f})")
    
    # Test 3: Movie search
    print("\n--- TEST 3: Movie Search ---")
    search_query = "The"
    print(f"\nSearching for movies containing '{search_query}'...")
    
    results = recommender.search_movies(search_query, limit=5)
    print(f"Found {len(results)} matches:")
    for i, movie in enumerate(results, 1):
        print(f"  {i}. {movie['title']} (Rating: {movie['rating']:.1f})")
    
    # Test 4: Movie info
    print("\n--- TEST 4: Movie Information ---")
    print(f"\nMovie: {test_movie}")
    info = recommender.get_movie_info(test_movie)
    print(f"  Year: {info['year']}")
    print(f"  Rating: {info['rating']:.1f}")
    print(f"  Genres: {', '.join(info['genres'])}")
    print(f"  Overview: {info['overview']}")
    
    print("\n" + "=" * 80)
    print("[OK] ALL TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 80)
