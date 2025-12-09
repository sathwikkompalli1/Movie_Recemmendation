const API_BASE = 'http://localhost:8000';
const TMDB_API_KEY = 'f76f21adfb842abd3437c23e9506a334';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_SEARCH_BASE = 'https://api.themoviedb.org/3/search/movie';
const WATCHMODE_API_KEY = 'qhoLfGsMly6yFmDNBjmOD9JmwWB0f9Zl98MiZQRx'; // Get from https://api.watchmode.com/
const WATCHMODE_SEARCH_BASE = 'https://api.watchmode.com/v1/search/';
const WATCHMODE_TITLE_BASE = 'https://api.watchmode.com/v1/title/';

const movieInput = document.getElementById('movieInput');
const modelSelect = document.getElementById('modelSelect');
const searchForm = document.getElementById('searchForm');
const content = document.getElementById('content');
const statsDiv = document.getElementById('stats');
const searchIconBtn = document.getElementById('searchIconBtn');

// Search Bar Expansion Logic
searchIconBtn.addEventListener('click', () => {
    searchForm.classList.toggle('active');
    if (searchForm.classList.contains('active')) {
        movieInput.focus();
    }
});

movieInput.addEventListener('focus', () => {
    searchForm.classList.add('active');
});

// Home Button Logic
const navLogo = document.querySelector('.nav-logo');
if (navLogo) {
    navLogo.addEventListener('click', () => {
        // Reset Search
        movieInput.value = '';
        searchForm.classList.remove('active');
        document.getElementById('suggestions').innerHTML = '';

        // Reset View
        const heroSection = document.getElementById('heroSection');
        const mainContainer = document.querySelector('.main-container');

        if (heroSection) heroSection.style.display = 'flex';
        if (mainContainer) mainContainer.classList.remove('search-active');

        // Clear Content
        content.innerHTML = '';

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// Close search if clicked outside
document.addEventListener('click', (e) => {
    if (!searchForm.contains(e.target)) {
        if (movieInput.value === '') {
            searchForm.classList.remove('active');
            document.getElementById('suggestions').innerHTML = ''; // Clear suggestions
        }
    }
});

// Load stats and genres on page load
loadStats();
loadGenres();

// Search form submission
searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const movieTitle = movieInput.value.trim();
    if (!movieTitle) return;

    await getRecommendations(movieTitle);

    // Scroll to content
    content.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('suggestions').innerHTML = '';
});

// Movie input autocomplete
movieInput.addEventListener('input', debounce(searchMovies, 300));

async function searchMovies() {
    const query = movieInput.value.trim();
    if (!query || query.length < 2) {
        document.getElementById('suggestions').innerHTML = '';
        return;
    }

    try {
        const response = await fetch(
            `${API_BASE}/search?query=${encodeURIComponent(query)}&limit=5`
        );
        const data = await response.json();

        const suggestionsDiv = document.getElementById('suggestions');
        suggestionsDiv.innerHTML = '';

        if (data.movies && data.movies.length > 0) {
            data.movies.forEach(movie => {
                const tag = document.createElement('div');
                tag.className = 'suggestion-tag';
                tag.textContent = `${movie.title}`;
                tag.onclick = () => {
                    movieInput.value = movie.title;
                    suggestionsDiv.innerHTML = '';
                    getRecommendations(movie.title); // Auto search on click
                };
                suggestionsDiv.appendChild(tag);
            });
        }
    } catch (error) {
        console.error('Search error:', error);
    }
}

// Modal Logic
const modal = document.getElementById('movieModal');
const modalBody = document.getElementById('modalBody');
const closeModal = document.querySelector('.close-modal');

if (closeModal) {
    closeModal.onclick = function () {
        if (modal) modal.style.display = "none";
    }
}

window.onclick = function (event) {
    if (modal && event.target == modal) {
        modal.style.display = "none";
    }
}

async function showMovieDetails(movie, posterUrl) {
    if (!modal || !modalBody) return;

    const genres = extractGenres(movie.genres).join(', ');

    let posterImg = '';
    if (posterUrl) {
        posterImg = `<img src="${posterUrl}" class="modal-poster">`;
    } else {
        posterImg = `<div class="modal-poster" style="height:300px; background:#333; display:flex; align-items:center; justify-content:center;"><span>No Image</span></div>`;
    }

    modalBody.innerHTML = `
        <div class="modal-flex">
            <div>${posterImg}</div>
            <div class="modal-info">
                <h2 class="modal-title">${movie.title}</h2>
                <div class="modal-meta">
                    <span class="rating">⭐ ${movie.rating.toFixed(1)}/10</span> • 
                    <span>${movie.year || 'N/A'}</span> • 
                    <span>${genres}</span>
                </div>
                <div class="modal-overview">${movie.overview || 'No description available.'}</div>
                <div id="streaming-info" class="streaming-info">
                    <div class="streaming-loader">🔍 Finding where to watch...</div>
                </div>
                <div style="font-size:0.8em; color:#aaa;">Match Score: ${(movie.hybrid_score || movie.similarity_score || 0).toFixed(2)}</div>
            </div>
        </div>
    `;
    modal.style.display = "block";

    // Fetch streaming availability
    fetchStreamingInfo(movie.title, movie.year);
}

async function getRecommendations(movieTitle) {
    // Hide Hero when searching
    const heroSection = document.getElementById('heroSection');
    const mainContainer = document.querySelector('.main-container');

    if (heroSection) {
        heroSection.style.display = 'none';
    }

    // Add class to fix spacing
    if (mainContainer) {
        mainContainer.classList.add('search-active');
    }

    content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';

    try {
        const modelType = modelSelect.value || 'hybrid';
        const response = await fetch(
            `${API_BASE}/recommend?movie_title=${encodeURIComponent(movieTitle)}&model_type=${modelType}&n_recommendations=12`
        );

        if (!response.ok) {
            throw new Error('Movie not found');
        }

        const data = await response.json();
        displayResults(data);
    } catch (error) {
        content.innerHTML = `<div class="error">❌ ${error.message}. Please try another title.</div>`;
    }
}

// Cache for poster URLs and streaming data
const posterCache = {};
const streamingCache = {};

async function fetchPosterUrl(movieTitle, year) {
    const cacheKey = `${movieTitle}_${year}`;

    if (posterCache[cacheKey]) return posterCache[cacheKey];

    if (!TMDB_API_KEY || TMDB_API_KEY === 'YOUR_API_KEY_HERE') return null;

    try {
        const searchUrl = `${TMDB_SEARCH_BASE}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movieTitle)}${year ? `&year=${year}` : ''}`;
        const response = await fetch(searchUrl);
        const data = await response.json();

        if (data.results && data.results.length > 0 && data.results[0].poster_path) {
            const posterUrl = `${TMDB_IMAGE_BASE}${data.results[0].poster_path}`;
            posterCache[cacheKey] = posterUrl;
            return posterUrl;
        }
    } catch (error) {
        console.error('Error fetching poster:', error);
    }

    return null;
}

function extractGenres(genres) {
    if (Array.isArray(genres)) {
        return genres.map(g => {
            if (typeof g === 'string') return g;
            if (typeof g === 'object' && g.name) return g.name;
            return '';
        }).filter(g => g);
    }
    return [];
}

async function displayResults(data) {
    let html = `
        <div class="results">
            <div class="query-movie">More Like: ${data.query_movie}</div>
            <div class="recommendations">
    `;

    // Store data globally for click handler
    window.currentRecommendations = data.recommendations;

    data.recommendations.forEach((movie, index) => {
        const genres = extractGenres(movie.genres).slice(0, 3).join(' • '); // Limit genres
        const itemId = `rec-item-${index}`;

        html += `
            <div class="rec-item" id="${itemId}" onclick="handleMovieClick(${index})">
                <div class="rec-poster-placeholder" id="poster-${index}">
                    <div style="text-align: center; padding: 10px;">
                        <div>🎬</div>
                        <div style="font-size: 0.8em; margin-top:5px;">${movie.title}</div>
                    </div>
                </div>
                <div class="rec-content">
                    <div class="rec-title">${movie.title}</div>
                    <div class="rec-meta">
                    <div class="rec-meta">
                        <span>${movie.year || ''}</span>
                    </div>
                    </div>
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    content.innerHTML = html;

    // Fetch posters
    data.recommendations.forEach(async (movie, index) => {
        const posterUrl = await fetchPosterUrl(movie.title, movie.year);
        // Update stored data
        if (window.currentRecommendations[index]) {
            window.currentRecommendations[index].posterUrl = posterUrl;
        }

        if (posterUrl) {
            const posterElement = document.getElementById(`poster-${index}`);
            if (posterElement) {
                posterElement.innerHTML = `<img src="${posterUrl}" alt="${movie.title}" class="rec-poster">`;
            }
        }
    });
}

function handleMovieClick(index) {
    if (window.currentRecommendations && window.currentRecommendations[index]) {
        const movie = window.currentRecommendations[index];
        const posterUrl = movie.posterUrl || null;
        showMovieDetails(movie, posterUrl);
    }
}

async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();

        statsDiv.innerHTML = `
            <div class="stat-grid" style="opacity: 0.5; font-size: 0.8em;">
                <div class="stat-item">
                    <div>${data.total_movies} Titles</div>
                </div>
                <div class="stat-item">
                    <div>${data.available_genres} Genres</div>
                </div>
                <div class="stat-item">
                    <div>AI Powered</div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Stats error:', error);
    }
}

async function fetchStreamingInfo(movieTitle, year) {
    const cacheKey = `${movieTitle}_${year}`;
    const streamingInfoDiv = document.getElementById('streaming-info');

    if (!streamingInfoDiv) return;

    // Check cache first
    if (streamingCache[cacheKey]) {
        displayStreamingInfo(streamingCache[cacheKey]);
        return;
    }

    // Check if API key is configured
    if (!WATCHMODE_API_KEY || WATCHMODE_API_KEY === 'YOUR_WATCHMODE_API_KEY_HERE') {
        console.log('Watchmode API key not configured');
        streamingInfoDiv.innerHTML = `
            <div class="streaming-header">Where to Watch</div>
            <div style="color:#999; font-size:0.85em;">
                Configure Watchmode API key to see streaming availability
            </div>
        `;
        return;
    }

    console.log('Fetching streaming info for:', movieTitle, year);

    try {
        // Step 1: Search for the movie to get Watchmode ID
        const searchUrl = `${WATCHMODE_SEARCH_BASE}?apiKey=${WATCHMODE_API_KEY}&search_field=name&search_value=${encodeURIComponent(movieTitle)}`;
        console.log('Watchmode search URL:', searchUrl.replace(WATCHMODE_API_KEY, 'API_KEY_HIDDEN'));

        const searchResponse = await fetch(searchUrl);
        console.log('Search response status:', searchResponse.status);

        const searchData = await searchResponse.json();
        console.log('Search results:', searchData);

        if (!searchData.title_results || searchData.title_results.length === 0) {
            streamingInfoDiv.innerHTML = `
                <div class="streaming-header">Where to Watch</div>
                <div style="color:#999; font-size:0.85em;">Streaming info not available</div>
            `;
            return;
        }

        // Find best match (prefer exact year match)
        let bestMatch = searchData.title_results[0];
        if (year) {
            const yearMatch = searchData.title_results.find(r => r.year === parseInt(year));
            if (yearMatch) bestMatch = yearMatch;
        }

        // Step 2: Get detailed info including sources
        const detailUrl = `${WATCHMODE_TITLE_BASE}${bestMatch.id}/details/?apiKey=${WATCHMODE_API_KEY}&append_to_response=sources`;
        console.log('Fetching details for Watchmode ID:', bestMatch.id);

        const detailResponse = await fetch(detailUrl);
        console.log('Detail response status:', detailResponse.status);

        const detailData = await detailResponse.json();
        console.log('Detail data:', detailData);

        // Cache the result
        streamingCache[cacheKey] = detailData;
        displayStreamingInfo(detailData);

    } catch (error) {
        console.error('Error fetching streaming info:', error);
        streamingInfoDiv.innerHTML = `
            <div class="streaming-header">Where to Watch</div>
            <div style="color:#999; font-size:0.85em;">Unable to load streaming info (${error.message})</div>
        `;
    }
}

function displayStreamingInfo(data) {
    const streamingInfoDiv = document.getElementById('streaming-info');
    if (!streamingInfoDiv) return;

    if (!data.sources || data.sources.length === 0) {
        streamingInfoDiv.innerHTML = `
            <div class="streaming-header">Where to Watch</div>
            <div style="color:#999; font-size:0.85em;">Not currently available on major streaming platforms</div>
        `;
        return;
    }

    // Filter for streaming sources (not rent/buy)
    const streamingSources = data.sources.filter(s =>
        s.type === 'sub' || s.type === 'free' || s.type === 'tve'
    );

    // Normalize platform names (merge Disney+ variants)
    const normalizedSources = streamingSources.map(source => {
        let normalizedName = source.name;

        // Merge Disney+ and Hotstar
        if (source.name.includes('Disney') || source.name.includes('Hotstar')) {
            normalizedName = 'Disney+';
        }
        // Normalize other platforms
        else if (source.name.includes('Prime')) {
            normalizedName = 'Prime Video';
        }
        else if (source.name.includes('HBO')) {
            normalizedName = 'HBO Max';
        }
        else if (source.name.includes('Apple TV')) {
            normalizedName = 'Apple TV+';
        }
        else if (source.name.includes('Paramount')) {
            normalizedName = 'Paramount+';
        }

        return { ...source, name: normalizedName };
    });

    // Remove duplicates by platform name
    const uniquePlatforms = {};
    normalizedSources.forEach(source => {
        if (!uniquePlatforms[source.name]) {
            uniquePlatforms[source.name] = source;
        }
    });

    const uniqueSources = Object.values(uniquePlatforms);

    // Platform configurations with colors and icons
    const platformConfig = {
        'Netflix': { color: '#E50914' },
        'Prime Video': { color: '#00A8E1' },
        'Disney+': { color: '#113CCF' },
        'Hulu': { color: '#1CE783' },
        'HBO Max': { color: '#9D34DA' },
        'Apple TV+': { color: '#000000' },
        'Paramount+': { color: '#0064FF' },
        'Peacock': { color: '#000000' },
        'YouTube Premium': { color: '#FF0000' }
    };

    let html = '<div class="streaming-header">Where to Watch</div>';

    if (uniqueSources.length > 0) {
        html += '<div class="streaming-platforms">';
        uniqueSources.slice(0, 8).forEach(source => {
            const config = platformConfig[source.name] || { color: '#666' };
            const iconHtml = getStreamingIcon(source.name, config);

            html += `
                <div class="streaming-platform" style="border-left: 3px solid ${config.color};">
                    ${iconHtml}
                    <span class="platform-name">${source.name}</span>
                </div>
            `;
        });
        html += '</div>';
    } else {
        html += '<div style="color:#999; font-size:0.85em;">Available for rent/purchase</div>';
    }

    streamingInfoDiv.innerHTML = html;
}

function getStreamingIcon(platformName, config) {
    // SVGs from Simple Icons and other open sources
    const icons = {
        'Netflix': `<svg role="img" viewBox="0 0 24 24" fill="${config.color}"><path d="M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.994 2.344.073 4.685.073 7.028 0-3.026-8.556-5.369-15.175-8.346-23.994C10.084.006 7.742.006 5.398 0zm8.489 0v24c2.344.073 4.686.073 7.028 0V0c-2.342-.006-4.684-.006-7.028 0zM5.398 0v24c2.344.073 4.686.073 7.028 0V0c-2.342-.006-4.684-.006-7.028 0z"/></svg>`,
        'Prime Video': `<svg role="img" viewBox="0 0 24 24" fill="${config.color}"><path d="M17.857 6.463c-.1-.137-.624-.065-.86-.033-.073.01-.084-.055-.018-.1.422-.3 1.115-.213 1.194-.112.081.101-.02.802-.417 1.137-.06.052-.119.024-.092-.044.09-.225.289-.728.193-.848m-5.896-.72c-.738.55-1.808.843-2.73 1.348C3.89 10.02 0 16.275 0 16.275s3.33-4.654 4.54-5.35c1.21-.696 2.316-.39 2.316-.39.467.106.671.32.775.52.128.243.084.453.084.453-.787 1.383-1.488 2.618-1.488 2.618s2.21-1.01 3.522-3.098c.319.463 3.69 5.337 3.69 5.337s1.378-2.61.168-5.31c4.545 1.776 5.86 4.938 5.753 5.32-.236.837-2.235 1.583-2.235 1.583s2.99-.907 3.328-2.124c.264-.954-1.288-4.226-8.913-6.142.158.118 7.355 5.518 1.94 2.277-.92-.55-1.99-1.298-2.614-1.66 0 0-2.633-1.696.533-3.18-.707.037-1.127.185-1.722.51l-.57.34c-.206.122-1.87.973-2.92 1.584.58-.337 1.164-.672 1.74-1.002.842-.482 1.62-.843 1.62-.843s-1.077.308-1.554.802"/></svg>`,
        'Disney+': `<img src="https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg" alt="Disney+" style="height: 24px; vertical-align: middle;">`,
        'Hulu': `<svg role="img" viewBox="0 0 24 24" fill="${config.color}"><path d="M14.707 15.957h1.912V8.043h-1.912zm-3.357-2.256a.517.517 0 01-.512.511H9.727a.517.517 0 01-.512-.511v-3.19H7.303v3.345c0 1.368.879 2.09 2.168 2.09h1.868c1.189 0 1.912-.856 1.912-2.09V10.51h-1.912c.01 0 .01 3.09.01 3.19zm10.75-3.19v3.19a.517.517 0 01-.512.511h-1.112a.517.517 0 01-.511-.511v-3.19h-1.912v3.345c0 1.368.878 2.09 2.167 2.09h1.868c1.19 0 1.912-.856 1.912-2.09V10.51zm-18.32 0H2.557c-.434 0-.645.11-.645.11V8.044H0v7.903h1.9v-3.179c0-.278.234-.511.512-.511h1.112c.278 0 .511.233.511.511v3.19h1.912v-3.446c0-1.445-.967-2-2.167-2Z"/></svg>`,
        'HBO Max': `<svg role="img" viewBox="0 0 24 24" fill="${config.color}"><title>HBO Max</title><path d="M3.784 8.716c-.655 0-1.32.29-2.173.946v-.78H0v6.236h1.715V11.24c.749-.592 1.091-.78 1.372-.78.333 0 .551.209.551.729v3.928h1.715V11.23c.748-.582 1.081-.769 1.372-.769.333 0 .55.208.55.728v3.928H8.99v-4.53c0-1.403-.8-1.871-1.57-1.871-.654 0-1.32.27-2.192.936-.28-.697-.894-.936-1.444-.936zm8.689 0c-1.705 0-3.118 1.466-3.118 3.284 0 1.82 1.413 3.285 3.118 3.285.842 0 1.57-.312 2.131-.988v.82h1.632V8.883h-1.632v.822c-.561-.676-1.29-.988-2.131-.988zm4.064.166c.707 1.102 1.507 2.09 2.443 3.077a26.593 26.593 0 0 0-2.443 3.16h2.069a13.603 13.603 0 0 1 1.673-2.183 14.067 14.067 0 0 1 1.632 2.182H24a25.142 25.142 0 0 0-2.432-3.16A23.918 23.918 0 0 0 24 8.883h-2.047a14.65 14.65 0 0 1-1.674 2.11 13.357 13.357 0 0 1-1.674-2.11zm-3.804 1.279c1.018 0 1.84.82 1.84 1.84a1.837 1.837 0 0 1-1.84 1.839c-1.019 0-1.84-.82-1.84-1.84 0-1.018.821-1.84 1.84-1.84zm0 .415c-.78 0-1.414.633-1.414 1.423s.634 1.424 1.413 1.424c.78 0 1.414-.634 1.414-1.424s-.634-1.424-1.414-1.424z"/></svg>`,
        'Apple TV+': `<svg role="img" viewBox="0 0 24 24" fill="white"><path d="M20.57 17.735h-1.815l-3.34-9.203h1.633l2.02 5.987c.075.231.273.9.586 2.012l.297-.997.33-1.006 2.094-6.004H24zm-5.344-.066a5.76 5.76 0 0 1-1.55.207c-1.23 0-1.84-.693-1.84-2.087V9.646h-1.063V8.532h1.121V7.081l1.476-.602v2.062h1.707v1.113H13.38v5.805c0 .446.074.75.214.932.14.182.396.264.75.264.207 0 .495-.041.883-.115zm-7.29-5.343c.017 1.764 1.55 2.358 1.567 2.366-.017.042-.248.842-.808 1.658-.487.71-.99 1.418-1.79 1.435-.783.016-1.03-.462-1.93-.462-.89 0-1.17.445-1.913.478-.758.025-1.344-.775-1.838-1.484-.998-1.451-1.765-4.098-.734-5.88.51-.89 1.426-1.451 2.416-1.46.75-.016 1.468.512 1.93.512.461 0 1.327-.627 2.234-.536.38.016 1.452.157 2.136 1.154-.058.033-1.278.743-1.27 2.219M6.468 7.988c.404-.495.685-1.18.61-1.864-.585.025-1.294.388-1.723.883-.38.437-.71 1.138-.619 1.806.652.05 1.328-.338 1.732-.825Z"/></svg>`,
        'Paramount+': `<svg role="img" viewBox="0 0 24 24" fill="${config.color}"><path d="M16.347 21.373c.057-.084.151-.314-.025-.74l-.53-1.428c-.073-.182.084-.293.19-.173 0 0 1.004 1.157 1.264 1.64l.495.822c.425.028 1.6.06 2.732.06a3.26 3.26 0 0 1-.316-.364c-1.93-2.392-3.154-3.724-3.166-3.737-.391-.426-.572-.508-.87-.643a4.82 4.82 0 0 1-.138-.065v.364c0 .047-.057.073-.086.022l-2.846-5.001a1.598 1.598 0 0 0-.508-.587l-.277-.194-1.354 3.123c.212 0 .354.216.27.409l-1.25 2.893h1.147c.443 0 .883.087 1.294.255l.302.125s-.913 1.878-.913 2.867c0 .181.028.362.075.534h2.104l-.096-.595s1.266.294 2.502.413M12 2.437c-6.627 0-12 5.373-12 12 0 2.669.873 5.133 2.346 7.126.503-.218.783-.542.983-.791l2.234-2.858a.467.467 0 0 1 .179-.138l.336-.146 3.674-4.659.534-.417 1.094-1.524a.482.482 0 0 1 .101-.102l.478-.347a.34.34 0 0 1 .398-.004l.578.407c.308.216.557.504.726.84l2.322 4.077c.051.09.09.129.182.174.454.227.732.268 1.33.913.277.304 1.495 1.666 3.203 3.784.236.318.538.588.963.783A11.948 11.948 0 0 0 24 14.437c0-6.627-5.373-12-12-12M3.236 15.1l-.778-.253-.48.662v-.818l-.778-.253.778-.253v-.818l.48.662.778-.253-.48.662Zm-.185 2.676-.252.778-.253-.778h-.818l.661-.481-.253-.777.663.48.66-.48-.252.777.662.481Zm.156-6.195.253.778-.661-.48-.663.48.253-.778-.66-.48h.817l.253-.778.252.777h.818Zm1.314-1.76L4.04 9.16l-.778.253.48-.661-.48-.663.778.254.48-.662v.818l.778.253-.777.252Zm2.045-2.862-.253.777-.252-.777h-.818l.662-.48-.253-.778.661.48.661-.48-.252.777.662.48Zm2.577-1.313-.48.661V5.49l-.779-.254.778-.253v-.817l.48.66.78-.253-.481.663.48.66zm3.265-.75.253.778-.661-.48-.662.48.252-.777-.66-.481h.818L12 3.637l.252.778h.818zm2.93.595v.816l-.481-.661-.777.252.48-.662-.48-.662.777.253.48-.66v.817l.779.252zm5.426 8.285.778.253.48-.662v.818l.778.253-.778.253v.818l-.48-.662-.778.253.48-.662zm-3.077-6.04-.253-.777h-.818l.662-.48-.253-.778.662.48.662-.48-.254.778.662.48h-.818zm1.792 2.086v-.818l-.777-.252.777-.253V7.68l.481.662.777-.254-.48.663.48.66-.777-.252zm1.469 1.278.253-.777.254.777h.816l-.66.481.252.778-.662-.48-.661.48.253-.778-.662-.48zm.506 6.676-.253.778-.253-.778h-.817l.662-.481-.253-.777.66.48.663-.48-.253.777.661.481zm-12.08-.615.76-1.588c.024-.048-.032-.108-.067-.067l-.664.668c-.313.329-.847 1.25-.95 1.421l-.808 1.335a.109.109 0 0 1 .1.162l-.739 1.238c-.18.309.145.523.189.452 1.157-1.868 1.832-1.719 1.832-1.719l.387-.897c.022-.047-.001-.1-.05-.12-.12-.05-.316-.27.01-.885z"/></svg>`,
        'Peacock': `<img src="https://upload.wikimedia.org/wikipedia/commons/d/d3/NBCUniversal_Peacock_Logo.svg" alt="Peacock" style="height: 24px; vertical-align: middle;">`,
        'YouTube Premium': `<svg role="img" viewBox="0 0 24 24" fill="${config.color}"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`
    };

    return icons[platformName] || `<div class="platform-icon-text" style="background: ${config.color}; color: white;">${platformName.slice(0, 2)}</div>`;
}

async function loadGenres() {
    try {
        const response = await fetch(`${API_BASE}/genres`);
        const data = await response.json();

        const genrePills = document.getElementById('genrePills');
        if (!genrePills) return;

        // Show popular genres
        const popularGenres = ['Action', 'Comedy', 'Drama', 'Thriller', 'Romance', 'Horror', 'Sci-Fi', 'Animation'];
        const availableGenres = data.genres.filter(g => popularGenres.includes(g));

        genrePills.innerHTML = availableGenres.map(genre =>
            `<button class="genre-pill" onclick="browseGenre('${genre}')">${genre}</button>`
        ).join('');
    } catch (error) {
        console.error('Error loading genres:', error);
    }
}

async function browseGenre(genre) {
    // Hide Hero
    const heroSection = document.getElementById('heroSection');
    const mainContainer = document.querySelector('.main-container');

    if (heroSection) {
        heroSection.style.display = 'none';
    }
    if (mainContainer) {
        mainContainer.classList.add('search-active');
    }

    content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
    content.scrollIntoView({ behavior: 'smooth' });

    try {
        const response = await fetch(
            `${API_BASE}/browse/genre/${encodeURIComponent(genre)}?n_recommendations=20&sort_by=rating`
        );

        if (!response.ok) {
            throw new Error('Genre not found');
        }

        const data = await response.json();
        displayGenreResults(data);
    } catch (error) {
        content.innerHTML = `<div class="error">❌ ${error.message}. Please try another genre.</div>`;
    }
}

async function displayGenreResults(data) {
    let html = `
        <div class="results">
            <div class="query-movie">Top ${data.genre} Movies</div>
            <div class="model-type">Sorted by ${data.sort_by} • ${data.total_found} movies available</div>
            <div class="recommendations">
    `;

    // Store data globally
    window.currentRecommendations = data.recommendations;

    data.recommendations.forEach((movie, index) => {
        const genres = extractGenres(movie.genres).slice(0, 3).join(' • ');
        const itemId = `rec-item-${index}`;

        html += `
            <div class="rec-item" id="${itemId}" onclick="handleMovieClick(${index})">
                <div class="rec-poster-placeholder" id="poster-${index}">
                    <div style="text-align: center; padding: 10px;">
                        <div>🎬</div>
                        <div style="font-size: 0.8em; margin-top:5px;">${movie.title}</div>
                    </div>
                </div>
                <div class="rec-content">
                    <div class="rec-title">${movie.title}</div>
                    <div class="rec-meta">
                    <div class="rec-meta">
                        <span>${movie.year || ''}</span>
                    </div>
                    </div>
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    content.innerHTML = html;

    // Fetch posters
    data.recommendations.forEach(async (movie, index) => {
        const posterUrl = await fetchPosterUrl(movie.title, movie.year);
        if (window.currentRecommendations[index]) {
            window.currentRecommendations[index].posterUrl = posterUrl;
        }

        if (posterUrl) {
            const posterElement = document.getElementById(`poster-${index}`);
            if (posterElement) {
                posterElement.innerHTML = `<img src="${posterUrl}" alt="${movie.title}" class="rec-poster">`;
            }
        }
    });
}

function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}

// 3D Tilt Effect Logic
document.addEventListener('mousemove', (e) => {
    const card = e.target.closest('.rec-item');
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate rotation (inverted for natural tilt)
    const rotateX = ((y - centerY) / centerY) * -10;
    const rotateY = ((x - centerX) / centerX) * 10;

    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
});

document.addEventListener('mouseout', (e) => {
    const card = e.target.closest('.rec-item');
    if (card) {
        // Reset transform
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
    }
});
