# YouTube Subtitle Formatter CLI

CLI tool for downloading a 1080p YouTube video, fetching English subtitles, and using OpenAI to produce bilingual study notes.

## Usage

1. Install dependencies: `pnpm install`
2. Set `OPENAI_API_KEY`
3. Run: `pnpm start -- --url "https://www.youtube.com/watch?v=..."`
4. Or start the web UI: `pnpm web`

Outputs are written to `outputs/<video-id>/`.

The generated Markdown contains:
- 3 alternative Chinese titles
- alternating English and Chinese paragraphs
- 3 or 4 difficult vocabulary items or expressions at the end
