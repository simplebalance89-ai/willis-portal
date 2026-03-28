# AGENTS.md — Willis Portal

## What This Repo Is
Willis Portal is an operations management hub with AI assistant (Scout). Features Signal messaging integration and voice-enabled AI ops assistance.

## Tech Stack
- **Language**: Python 3.11+
- **Framework**: FastAPI
- **AI**: Azure OpenAI (GPT-4)
- **Messaging**: Signal
- **Deployment**: Render

## Directory Structure
```
├── agent.py            # Scout AI assistant
├── server.py           # FastAPI server
├── static/             # Frontend assets
│   ├── index.html
│   └── ...
├── drops/              # File drops/uploads
├── Dockerfile
├── render.yaml
└── requirements.txt
```

## How to Work Here

### Running Locally
```bash
pip install -r requirements.txt
python server.py
```

### Key Conventions
- Dual navigation (icon-based)
- Hawaii vibes + Applebee's jargon theme
- Signal messaging hub for external communication

### Scout Agent
- Voice input support
- Operations-focused AI assistant
- Integrated with portal actions

### Environment Variables
```bash
AZURE_OPENAI_KEY=
AZURE_OPENAI_ENDPOINT=
SIGNAL_API_KEY=         # If using Signal API
```

## Current Priorities
- Scout agent enhancements
- Signal messaging integration
- Operations dashboard improvements

## Deployment
- **Platform**: Render
- **Type**: Python web service
