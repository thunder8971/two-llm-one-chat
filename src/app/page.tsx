import { Chat } from "@/components/chat";
import { readConfig } from "@/config/llm";
export const dynamic = "force-dynamic";
export default function Home() {
  let config;
  try {
    config = readConfig();
  } catch {
    return (
      <Chat
        mode="unavailable"
        configurationError="The server configuration is incomplete. Check the provider, model, API key, and limit settings in .env.local."
      />
    );
  }
  return (
    <Chat
      mode={config.mode}
      providers={{
        writer: { id: config.writer.id, model: config.writer.model },
        reviewer: { id: config.reviewer.id, model: config.reviewer.model },
      }}
    />
  );
}
