import { Request, Response, NextFunction } from 'express';
import { validateApiKey } from '../src/middleware/auth';

describe('API Key Authentication Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    mockRequest = {
      headers: {}
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    nextFunction = jest.fn();
    originalApiKey = process.env.API_KEY;
  });

  afterEach(() => {
    process.env.API_KEY = originalApiKey;
  });

  it('should return 500 if API_KEY is not configured', () => {
    delete process.env.API_KEY;

    validateApiKey(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Server configuration error'
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 401 if X-API-Key header is missing', () => {
    process.env.API_KEY = 'test-api-key';

    validateApiKey(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Missing X-API-Key header'
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 403 if API key is invalid', () => {
    process.env.API_KEY = 'correct-api-key';
    mockRequest.headers = {
      'x-api-key': 'wrong-api-key'
    };

    validateApiKey(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Invalid API key'
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should call next() if API key is valid', () => {
    process.env.API_KEY = 'correct-api-key';
    mockRequest.headers = {
      'x-api-key': 'correct-api-key'
    };

    validateApiKey(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(nextFunction).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
    expect(mockResponse.json).not.toHaveBeenCalled();
  });

  it('should be case-sensitive for header name', () => {
    process.env.API_KEY = 'test-api-key';
    mockRequest.headers = {
      'X-API-KEY': 'test-api-key' // Wrong case
    };

    validateApiKey(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should handle array header values', () => {
    process.env.API_KEY = 'test-api-key';
    mockRequest.headers = {
      'x-api-key': ['test-api-key', 'another-key'] as any
    };

    validateApiKey(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(nextFunction).not.toHaveBeenCalled();
  });
});
