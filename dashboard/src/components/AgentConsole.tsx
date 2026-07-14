"use client";

import React, { useState, useRef, useEffect } from "react";
import { useSentinelStore } from "../store/useSentinelStore";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Terminal, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatMessage {
  type: "question" | "answer" | "error";
  text: string;
}

export function AgentConsole() {
  const agentLogs = useSentinelStore((state) => state.agentLogs);
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  
  const consoleBottomRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll console logs
  useEffect(() => {
    if (consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentLogs]);

  // Auto-scroll chat replies
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory, loading]);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = question.trim();
    if (!query) return;

    setQuestion("");
    setChatHistory((prev) => [...prev, { type: "question", text: query }]);
    setLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
      if (!res.ok) throw new Error("RAG query failed");
      const data = await res.json();
      setChatHistory((prev) => [...prev, { type: "answer", text: data.answer }]);
    } catch (err: any) {
      setChatHistory((prev) => [...prev, { type: "error", text: err.message || "Error contacting database." }]);
    } finally {
      setLoading(false);
    }
  };

  const getAgentEmoji = (agent: string) => {
    switch (agent.toLowerCase()) {
      case "analyst":
        return "🔍";
      case "dispatcher":
        return "🚨";
      case "reporter":
        return "📝";
      case "system":
        return "⏱️";
      default:
        return "⚙️";
    }
  };

  const getAgentColor = (agent: string) => {
    switch (agent.toLowerCase()) {
      case "analyst":
        return "text-[#8be9fd]"; // Cyan
      case "dispatcher":
        return "text-[#ff79c6]"; // Pink
      case "reporter":
        return "text-[#f1fa8c]"; // Yellow
      case "system":
        return "text-[#6272a4]"; // Comment
      default:
        return "text-[#bd93f9]"; // Purple
    }
  };

  return (
    <Card className="bg-[#0f101a] border-white/5 flex flex-col h-[400px] overflow-hidden terminal-header relative">
      <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between space-y-0 z-10">
        <CardTitle className="text-xs uppercase font-mono text-[#6272a4] flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-[#ff79c6]" />
          Agent Reasoning Terminal & RAG Console
        </CardTitle>
      </CardHeader>

      <CardContent className="p-3 flex-grow flex flex-col md:flex-row gap-3 min-h-0 z-10">
        {/* Left Side: Agent Reasoning Output */}
        <div className="flex-1 flex flex-col bg-[#050508] border border-white/5 rounded p-2 overflow-hidden">
          <div className="text-[10px] font-mono text-[#6272a4] border-bottom border-white/5 pb-1 mb-1.5 uppercase flex justify-between select-none">
            <span>&gt;_ Agent Trace Shell</span>
            <span className="animate-pulse text-[#50fa7b]">● SYSTEM LIVE</span>
          </div>
          
          <div className="flex-grow overflow-y-auto space-y-1.5 pr-1 font-mono text-[10px] select-text">
            {agentLogs.map((log) => (
              <div key={log.id} className="leading-relaxed hover:bg-white/[0.02] p-0.5 rounded transition-colors">
                <span className="text-[#6272a4] mr-1.5">[{log.timestamp}]</span>
                <span className={`${getAgentColor(log.agent)} font-bold mr-1.5`}>
                  {getAgentEmoji(log.agent)} {log.agent.toUpperCase()}:
                </span>
                <span className="text-[#f8f8f2]">{log.msg}</span>
                {log.extra && Object.keys(log.extra).length > 0 && (
                  <span className="text-[#6272a4] text-[9px] block pl-14">
                    {Object.entries(log.extra)
                      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
                      .join(" ")}
                  </span>
                )}
              </div>
            ))}
            {agentLogs.length === 0 && (
              <div className="flex items-center justify-center h-full text-[#6272a4] select-none text-[11px]">
                Waiting for incident simulation or analysis stream...
              </div>
            )}
            <div ref={consoleBottomRef} />
          </div>
        </div>

        {/* Right Side: RAG Chat Shell */}
        <div className="w-full md:w-[240px] flex flex-col bg-[#050508] border border-white/5 rounded p-2 overflow-hidden">
          <div className="text-[10px] font-mono text-[#6272a4] border-bottom border-white/5 pb-1 mb-1.5 uppercase select-none">
            💬 RAG Incident Store Chat
          </div>

          {/* Chat Bubble Window */}
          <div className="flex-grow overflow-y-auto space-y-2 pr-1 font-mono text-[10px] mb-2 select-text">
            <div className="text-[#6272a4] p-1.5 rounded bg-white/[0.01] border border-white/[0.03]">
              Type a query below to ask the Reporter agent details about confirmed incidents.
            </div>
            
            {chatHistory.map((chat, idx) => (
              <div
                key={idx}
                className={`p-1.5 rounded border leading-relaxed ${
                  chat.type === "question"
                    ? "bg-[#bd93f9]/5 border-[#bd93f9]/20 text-[#bd93f9] ml-4 text-right"
                    : chat.type === "error"
                    ? "bg-[#ff5555]/5 border-[#ff5555]/20 text-[#ff5555]"
                    : "bg-[#50fa7b]/5 border-[#50fa7b]/20 text-[#f8f8f2] mr-4"
                }`}
              >
                <div className="text-[8px] uppercase text-[#6272a4] mb-0.5">
                  {chat.type === "question" ? "User Query" : "Reporter"}
                </div>
                <div className="whitespace-pre-line">{chat.text}</div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-1.5 text-[#6272a4] p-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#bd93f9] animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#bd93f9] animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#bd93f9] animate-bounce [animation-delay:0.4s]" />
                <span>Reporter querying store...</span>
              </div>
            )}
            
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Form Input */}
          <form onSubmit={handleAsk} className="flex gap-1.5">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. summarize incidents in Z-02"
              className="flex-grow h-7 px-2 bg-black border border-white/5 focus:border-[#bd93f9]/50 rounded text-[10px] font-mono text-white placeholder-[#6272a4] focus:outline-none"
            />
            <Button
              size="sm"
              type="submit"
              className="h-7 w-7 p-0 bg-[#bd93f9] hover:bg-[#bd93f9]/80 text-[#0a0a0f] rounded cursor-pointer flex items-center justify-center"
            >
              <Send className="w-3 h-3" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
export default AgentConsole;
