"""
Unified LLM adapter — supports Anthropic, OpenAI.
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
