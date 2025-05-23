"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [username, setUsername] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      router.push(`/stream?username=${encodeURIComponent(username)}`);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form
        className="flex flex-col items-center gap-6 w-full max-w-xs"
        onSubmit={handleSubmit}
      >
        <input
          className="border border-gray-300 rounded px-4 py-2 w-full text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          type="text"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <button
          className="bg-blue-600 text-white rounded px-6 py-2 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed w-full transition-colors hover:bg-blue-700"
          type="submit"
          disabled={!username.trim()}
        >
          Stream
        </button>
        <button
          className="bg-gray-700 text-white rounded px-6 py-2 text-lg font-semibold w-full transition-colors hover:bg-gray-800"
          type="button"
          onClick={() => router.push("/watch")}
        >
          Watch
        </button>
      </form>
    </div>
  );
}
