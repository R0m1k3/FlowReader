package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

// AIService handles interactions with AI providers (OpenRouter).
type AIService struct {
	apiKey string
	client *http.Client
}

// NewAIService creates a new AI service.
func NewAIService() *AIService {
	return &AIService{
		apiKey: os.Getenv("OPENROUTER_API_KEY"),
		client: &http.Client{},
	}
}

// OpenRouterRequest represents the request body for OpenRouter.
type OpenRouterRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
}

// Message represents a message in the conversation.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// OpenRouterResponse represents the response body from OpenRouter.
type OpenRouterResponse struct {
	Choices []struct {
		Message Message `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// Summarize generates a concise summary of the given content.
func (s *AIService) Summarize(ctx context.Context, content string) (string, error) {
	if s.apiKey == "" {
		return "", fmt.Errorf("OPENROUTER_API_KEY not set")
	}

	prompt := fmt.Sprintf("Résume l'article suivant en 3 à 5 phrases percutantes. Sois direct et informatif :\n\n%s", content)

	reqBody := OpenRouterRequest{
		Model: "google/gemini-2.0-flash-001", // Économique et performant
		Messages: []Message{
			{Role: "user", Content: prompt},
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshaling request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("creating request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("HTTP-Referer", "https://github.com/michael/flowreader") // Optionnel pour OpenRouter

	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("sending request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var orResp OpenRouterResponse
	if err := json.Unmarshal(body, &orResp); err != nil {
		return "", fmt.Errorf("unmarshaling response: %w", err)
	}

	if orResp.Error != nil {
		return "", fmt.Errorf("OpenRouter error: %s", orResp.Error.Message)
	}

	if len(orResp.Choices) == 0 {
		return "", fmt.Errorf("no summary generated")
	}

	return orResp.Choices[0].Message.Content, nil
}
