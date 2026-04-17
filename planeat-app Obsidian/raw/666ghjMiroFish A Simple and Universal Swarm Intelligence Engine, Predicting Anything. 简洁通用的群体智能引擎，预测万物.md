---
title: "666ghj/MiroFish: A Simple and Universal Swarm Intelligence Engine, Predicting Anything. 简洁通用的群体智能引擎，预测万物"
source: "https://github.com/666ghj/MiroFish"
author:
published:
created: 2026-04-17
description: "A Simple and Universal Swarm Intelligence Engine, Predicting Anything. 简洁通用的群体智能引擎，预测万物 - 666ghj/MiroFish"
tags:
  - "clippings"
---
## ⚡ Overview

**MiroFish** is a next-generation AI prediction engine powered by multi-agent technology. By extracting seed information from the real world (such as breaking news, policy drafts, or financial signals), it automatically constructs a high-fidelity parallel digital world. Within this space, thousands of intelligent agents with independent personalities, long-term memory, and behavioral logic freely interact and undergo social evolution. You can inject variables dynamically from a "God's-eye view" to precisely deduce future trajectories — **rehearse the future in a digital sandbox, and win decisions after countless simulations**.

> You only need to: Upload seed materials (data analysis reports or interesting novel stories) and describe your prediction requirements in natural language  
> MiroFish will return: A detailed prediction report and a deeply interactive high-fidelity digital world

### Our Vision

MiroFish is dedicated to creating a swarm intelligence mirror that maps reality. By capturing the collective emergence triggered by individual interactions, we break through the limitations of traditional prediction:

- **At the Macro Level**: We are a rehearsal laboratory for decision-makers, allowing policies and public relations to be tested at zero risk
- **At the Micro Level**: We are a creative sandbox for individual users — whether deducing novel endings or exploring imaginative scenarios, everything can be fun, playful, and accessible

From serious predictions to playful simulations, we let every "what if" see its outcome, making it possible to predict anything.

## 🌐 Live Demo

Welcome to visit our online demo environment and experience a prediction simulation on trending public opinion events we've prepared for you: [mirofish-live-demo](https://666ghj.github.io/mirofish-demo/)

## 📸 Screenshots

| [![Screenshot 1](https://github.com/666ghj/MiroFish/raw/main/static/image/Screenshot/%E8%BF%90%E8%A1%8C%E6%88%AA%E5%9B%BE1.png)](https://github.com/666ghj/MiroFish/blob/main/static/image/Screenshot/%E8%BF%90%E8%A1%8C%E6%88%AA%E5%9B%BE1.png) | [![Screenshot 2](https://github.com/666ghj/MiroFish/raw/main/static/image/Screenshot/%E8%BF%90%E8%A1%8C%E6%88%AA%E5%9B%BE2.png)](https://github.com/666ghj/MiroFish/blob/main/static/image/Screenshot/%E8%BF%90%E8%A1%8C%E6%88%AA%E5%9B%BE2.png) |
| --- | --- |
| [![Screenshot 3](https://github.com/666ghj/MiroFish/raw/main/static/image/Screenshot/%E8%BF%90%E8%A1%8C%E6%88%AA%E5%9B%BE3.png)](https://github.com/666ghj/MiroFish/blob/main/static/image/Screenshot/%E8%BF%90%E8%A1%8C%E6%88%AA%E5%9B%BE3.png) | [![Screenshot 4](https://github.com/666ghj/MiroFish/raw/main/static/image/Screenshot/%E8%BF%90%E8%A1%8C%E6%88%AA%E5%9B%BE4.png)](https://github.com/666ghj/MiroFish/blob/main/static/image/Screenshot/%E8%BF%90%E8%A1%8C%E6%88%AA%E5%9B%BE4.png) |
| [![Screenshot 5](https://github.com/666ghj/MiroFish/raw/main/static/image/Screenshot/%E8%BF%90%E8%A1%8C%E6%88%AA%E5%9B%BE5.png)](https://github.com/666ghj/MiroFish/blob/main/static/image/Screenshot/%E8%BF%90%E8%A1%8C%E6%88%AA%E5%9B%BE5.png) | [![Screenshot 6](https://github.com/666ghj/MiroFish/raw/main/static/image/Screenshot/%E8%BF%90%E8%A1%8C%E6%88%AA%E5%9B%BE6.png)](https://github.com/666ghj/MiroFish/blob/main/static/image/Screenshot/%E8%BF%90%E8%A1%8C%E6%88%AA%E5%9B%BE6.png) |

## 🎬 Demo Videos

### 1\. Wuhan University Public Opinion Simulation + MiroFish Project Introduction

[![MiroFish Demo Video](https://github.com/666ghj/MiroFish/raw/main/static/image/%E6%AD%A6%E5%A4%A7%E6%A8%A1%E6%8B%9F%E6%BC%94%E7%A4%BA%E5%B0%81%E9%9D%A2.png)](https://www.bilibili.com/video/BV1VYBsBHEMY/)

Click the image to watch the complete demo video for prediction using BettaFish-generated "Wuhan University Public Opinion Report"

### 2\. Dream of the Red Chamber Lost Ending SimulationClick the image to watch MiroFish's deep prediction of the lost ending based on hundreds of thousands of words from the first 80 chapters of "Dream of the Red Chamber"

> **Financial Prediction**, **Political News Prediction** and more examples coming soon...

## 🔄 Workflow

1. **Graph Building**: Seed extraction & Individual/collective memory injection & GraphRAG construction
2. **Environment Setup**: Entity relationship extraction & Persona generation & Agent configuration injection
3. **Simulation**: Dual-platform parallel simulation & Auto-parse prediction requirements & Dynamic temporal memory updates
4. **Report Generation**: ReportAgent with rich toolset for deep interaction with post-simulation environment
5. **Deep Interaction**: Chat with any agent in the simulated world & Interact with ReportAgent

## 🚀 Quick Start

#### Prerequisites

| Tool | Version | Description | Check Installation |
| --- | --- | --- | --- |
| **Node.js** | 18+ | Frontend runtime, includes npm | `node -v` |
| **Python** | ≥3.11, ≤3.12 | Backend runtime | `python --version` |
| **uv** | Latest | Python package manager | `uv --version` |

#### 1\. Configure Environment Variables

```
# Copy the example configuration file
cp .env.example .env

# Edit the .env file and fill in the required API keys
```

**Required Environment Variables:**

```
# LLM API Configuration (supports any LLM API with OpenAI SDK format)
# Recommended: Alibaba Qwen-plus model via Bailian Platform: https://bailian.console.aliyun.com/
# High consumption, try simulations with fewer than 40 rounds first
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL_NAME=qwen-plus

# Zep Cloud Configuration
# Free monthly quota is sufficient for simple usage: https://app.getzep.com/
ZEP_API_KEY=your_zep_api_key
```

#### 2\. Install Dependencies

```
# One-click installation of all dependencies (root + frontend + backend)
npm run setup:all
```

Or install step by step:

```
# Install Node dependencies (root + frontend)
npm run setup

# Install Python dependencies (backend, auto-creates virtual environment)
npm run setup:backend
```

#### 3\. Start Services

```
# Start both frontend and backend (run from project root)
npm run dev
```

**Service URLs:**

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5001`

**Start Individually:**

```
npm run backend   # Start backend only
npm run frontend  # Start frontend only
```

### Option 2: Docker Deployment

```
# 1. Configure environment variables (same as source deployment)
cp .env.example .env

# 2. Pull image and start
docker compose up -d
```

Reads `.env` from root directory by default, maps ports `3000 (frontend) / 5001 (backend)`

> Mirror address for faster pulling is provided as comments in `docker-compose.yml`, replace if needed.

## 📬 Join the Conversation

[![QQ Group](https://github.com/666ghj/MiroFish/raw/main/static/image/QQ%E7%BE%A4.png)](https://github.com/666ghj/MiroFish/blob/main/static/image/QQ%E7%BE%A4.png)

The MiroFish team is recruiting full-time/internship positions. If you're interested in multi-agent simulation and LLM applications, feel free to send your resume to: **[mirofish@shanda.com](mailto:mirofish@shanda.com)**

## 📄 Acknowledgments

**MiroFish has received strategic support and incubation from Shanda Group!**

MiroFish's simulation engine is powered by **[OASIS (Open Agent Social Interaction Simulations)](https://github.com/camel-ai/oasis)**, We sincerely thank the CAMEL-AI team for their open-source contributions!

[

![Star History Chart](https://camo.githubusercontent.com/6e9df1d521fe701f5744839465a3ba11620996bf73a8d09eddb29fd4bf89ef97/68747470733a2f2f6170692e737461722d686973746f72792e636f6d2f7376673f7265706f733d36363667686a2f4d69726f4669736826747970653d64617465266c6567656e643d746f702d6c656674)

](https://www.star-history.com/#666ghj/MiroFish&type=date&legend=top-left)