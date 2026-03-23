# YouTube Subtitle Formatter CLI

CLI tool for downloading a 1080p YouTube video, fetching English subtitles, and using OpenAI to produce Chinese study notes with title ideas.

## Usage

1. Install dependencies: `pnpm install`
2. Set `OPENAI_API_KEY`
3. Run: `pnpm start -- --url "https://www.youtube.com/watch?v=..."`

Outputs are written to `outputs/<video-id>/`.
