const request = require('supertest');
const app = require('../../server/app');

describe('API Endpoints', () => {
  describe('POST /api/analyze', () => {
    it('should return error for missing URL', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('URL is required');
    });

    it('should return error for invalid URL', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .send({ url: 'invalid-url' });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Unsupported URL format');
    });

    it('should analyze valid Spotify URL', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .send({ url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWFJp76kzH' });
      
      expect(response.status).toBe(200);
      expect(response.body.platform).toBe('spotify');
      expect(response.body.type).toBe('playlist');
    });

    it('should analyze valid YouTube URL', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
      
      expect(response.status).toBe(200);
      expect(response.body.platform).toBe('youtube');
      expect(response.body.type).toBe('video');
    });
  });

  describe('POST /api/extract', () => {
    it('should return error for missing URL', async () => {
      const response = await request(app)
        .post('/api/extract')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('URL is required');
    });

    it('should require authentication for Spotify URLs', async () => {
      const response = await request(app)
        .post('/api/extract')
        .send({ url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWFJp76kzH' });
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Spotify authentication required');
    });
  });

  describe('GET /api/auth/status', () => {
    it('should return authentication status', async () => {
      const response = await request(app)
        .get('/api/auth/status');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('authenticated');
      expect(response.body).toHaveProperty('spotify');
    });
  });
});
