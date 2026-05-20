"""
Unified LLM adapter — supports Anthropic, OpenAI, Google Gemini.
Returns {"type": "text", "content": str}
     or {"type": "tool_calls", "calls": [{"name": str, "input": dict}]}
"""
from typing import List
import anthropic
import openai


async def call_llm(
    provider: str,
    model: str,
    api_key: str,
    system_prompt: str,
    messages: List[dict],
    tools: List[dict],
) -> dict:
    if provider == "anthropic":
        return await _call_anthropic(model, api_key, system_prompt, messages, tools)
    elif provider == "openai":
        return await _call_openai(model, api_key, system_prompt, messages, tools)
    elif provider == "google":
        return await _call_google(model, api_key, system_prompt, messages, tools)
    else:
        raise ValueError(f"Unsupported provider: {provider}")


async def _call_anthropic(model, api_key, system_prompt, messages, tools):
    import asyncio
    client = anthropic.Anthropic(api_key=api_key)

    def _run():
        kwargs = dict(
            model=model,
            max_tokens=2048,
            system=system_prompt,
            messages=messages,
        )
        if tools:
            kwargs["tools"] = tools
        return client.messages.create(**kwargs)

    response = await asyncio.to_thread(_run)

    tool_calls = [b for b in response.content if b.type == "tool_use"]
    if tool_calls:
        return {
            "type": "tool_calls",
            "calls": [{"name": b.name, "input": b.input, "id": b.id} for b in tool_calls],
            "raw_content": response.content,
        }
    text = next((b.text for b in response.content if hasattr(b, "text")), "")
    return {"type": "text", "content": text}


async def _call_openai(model, api_key, system_prompt, messages, tools):
    import asyncio
    import json
    client = openai.OpenAI(api_key=api_key)

    oai_messages = [{"role": "system", "content": system_prompt}] + messages
    oai_tools = [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {}),
            },
        }
        for t in tools
    ] if tools else []

    def _run():
        kwargs = dict(model=model, messages=oai_messages, max_tokens=2048)
        if oai_tools:
            kwargs["tools"] = oai_tools
            kwargs["tool_choice"] = "auto"
        return client.chat.completions.create(**kwargs)

    response = await asyncio.to_thread(_run)
    msg = response.choices[0].message

    if msg.tool_calls:
        return {
            "type": "tool_calls",
            "calls": [
                {"name": tc.function.name, "input": json.loads(tc.function.arguments), "id": tc.id}
                for tc in msg.tool_calls
            ],
        }
    return {"type": "text", "content": msg.content or ""}


async def _call_google(model, api_key, system_prompt, messages, tools):
    import asyncio
    import json
    import google.generativeai as genai

    genai.configure(api_key=api_key)

    # Convert Anthropic-format tool schemas to Gemini function declarations
    gemini_tools = None
    if tools:
        from google.generativeai.types import FunctionDeclaration, Tool
        declarations = []
        for t in tools:
            schema = t.get("input_schema", {})
            declarations.append(FunctionDeclaration(
                name=t["name"],
                description=t.get("description", ""),
                parameters=schema,
            ))
        gemini_tools = [Tool(function_declarations=declarations)]

    # Convert messages to Gemini format
    gemini_history = []
    for m in messages:
        role = "user" if m["role"] == "user" else "model"
        content = m["content"] if isinstance(m["content"], str) else str(m["content"])
        gemini_history.append({"role": role, "parts": [content]})

    def _run():
        client = genai.GenerativeModel(
            model_name=model,
            system_instruction=system_prompt,
            tools=gemini_tools,
        )
        chat = client.start_chat(history=gemini_history[:-1] if len(gemini_history) > 1 else [])
        last_msg = gemini_history[-1]["parts"][0] if gemini_history else ""
        return chat.send_message(last_msg)

    response = await asyncio.to_thread(_run)

    # Check for function calls
    part = response.candidates[0].content.parts[0]
    if hasattr(part, "function_call") and part.function_call.name:
        fc = part.function_call
        args = dict(fc.args) if fc.args else {}
        return {
            "type": "tool_calls",
            "calls": [{"name": fc.name, "input": args, "id": fc.name}],
        }
    return {"type": "text", "content": response.text or ""}
