export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;       // ISO date string
  readingTime: string;
  category: string;
  content: string;    // plain text / basic HTML for now; swap for MDX later
};

export const POSTS: Post[] = [
  {
    slug: "web-testing-is-broken",
    title: "Web Testing Is Broken — So We Built an Agent That Can See",
    excerpt:
      "Every major testing framework relies on recorded scripts frozen in time. We decided to give our agent eyes instead, and it changed everything.",
    date: "2026-05-15",
    readingTime: "5 min read",
    category: "Product",
    content: `
Every QA engineer has felt this pain. You spend two days writing a test suite — thorough, clean, covering every user flow. Then the designer rounds a button's corners and changes one class name, and half your tests turn red overnight.

That's the fundamental problem with how we've been testing web applications for the past decade. Tools like Selenium and most codegen-based frameworks record scripts — rigid sequences of DOM queries frozen at a single moment in time. They don't understand the page. They match patterns.

A human QA engineer doesn't work that way. They look at the page, read it visually, decide what to click based on what they see, and verify the result with their own eyes. They don't care what the button's class name is — they click the blue button that says "Submit."

That insight is the entire premise behind Project Hawkeye: what if tests could see?

## The Visual Agent Approach

At every step of a test, Hawkeye's agent does two things simultaneously. It takes a screenshot of the current browser state and captures the page's accessibility tree — a structured representation of every interactive element. Both go to a vision-capable language model.

The screenshot gives the agent spatial understanding: layout, color, visual hierarchy, error states. If there's a red toast notification in the corner, the agent sees it. If a modal has appeared, the agent sees that too. The accessibility tree gives the agent precision — exact references to elements it can click, type into, or select from.

This dual-input design is what separates Hawkeye from both traditional testing tools, which have no vision, and pure screenshot-based agents, which can see but lack precision for interaction.

## Writing Tests That Adapt

Instead of recording a sequence of clicks, you describe a goal in plain language: log in to the app and add the first product to the shopping cart. The agent figures out how to accomplish that goal by looking at what's actually on the screen.

You can provide checkpoints — intermediate milestones the agent should hit in order. Or you can leave it completely open and let the agent plan its own route. The result is a test that doesn't break when you rename a class, move a button, or completely redesign the checkout flow.

## What Happens When a Site Fights Back

Not every test succeeds — and that's intentional. When we ran the agent against a site with aggressive bot detection, it hit a wall and received a CAPTCHA. Against a site that required login credentials it didn't have, it correctly identified the blocker within two steps and stopped.

The agent doesn't crash on hostile sites. It reasons about what it sees, recognizes when the goal is blocked, and returns a clear result with its observations and reasoning. That behavior — graceful failure with evidence — is what makes it useful in a real CI pipeline rather than just a demo.

## The Bigger Picture

The goal of Project Hawkeye isn't to replace human QA. It's to automate the part of QA that's currently too brittle to automate reliably: visual verification against real, changing user interfaces. When a test passes in Hawkeye, it means an agent looked at your application the way a user would, followed a goal, and visually confirmed the outcome. That's a different kind of confidence.
    `.trim(),
  },
  {
    slug: "from-cli-to-saas-in-20-days",
    title: "From CLI Tool to SaaS Platform in 20 Days",
    excerpt:
      "208 commits. 8 development epochs. One team building a complete AI-powered testing platform from scratch. Here's the honest retrospective.",
    date: "2026-05-12",
    readingTime: "6 min read",
    category: "Product",
    content: `
We shipped the first version of Hawkeye — a command-line tool that could run a single test against a browser sandbox — in under a week. What followed was 20 days of building everything else: the API, the job queue, the real-time streaming, the frontend, the vault, the billing, the organization management, and the production hardening.

208 commits. Five layers of infrastructure. Two people doing the bulk of the work.

## How We Structured the Build

We didn't build linearly. We built in epochs, each one unlocking the next.

Epoch one was the sandbox — a Docker container with a full browser, a virtual display, and a live VNC viewer so you could watch the agent work in real time. Without that, there was nothing for an agent to interact with.

Epoch two was the agent itself — a state machine that could observe a page, reason about what to do, execute an action, and check whether the goal was complete. The state machine approach turned out to be far more valuable than a simple loop, because it gave us explicit places to add guard-rails, error recovery, and goal verification.

Epochs three and four turned the agent into a platform: a REST API, a job queue so tests could run in the background, WebSocket streaming so the frontend could show live progress, and a full multi-tenant SaaS with projects, test cases, vault secrets, schedules, and billing.

## The 94-Commit Sprint

Phase 6 — what we internally called production hardening — was the most intense period. 94 commits in six days, across seven parallel tracks: database persistence, auth middleware, Stripe billing, GitHub CI integration, organization management, and a dozen smaller fixes.

This is where the real engineering happened. Not building features, but making them reliable. Connection pools that broke under Celery's process model. Real-time log events that appeared one step late due to asyncio task scheduling. Guard-rails that had to maintain conversation validity when blocking an agent's action.

Each of these bugs was invisible until we ran the system under real load with real LLM calls. That's the nature of distributed async systems — the problems don't show up in unit tests.

## What We'd Do Differently

We'd invest earlier in observability. The hardest bugs to fix were the ones we couldn't see — events arriving late, connections silently failing on the second task, middleware running in the wrong order. Better internal logging from day one would have saved days of debugging.

We'd also be more aggressive about the SQLite fallback from the start. One of the best decisions we made was designing the database layer so the entire stack runs with zero infrastructure — no PostgreSQL, no containers, just a local file. That made local development fast and iteration tight. We added it late; we should have started there.

## What Surprised Us

How much of the complexity was in the details, not the features. The features — visual agent, vault encryption, Stripe billing — each took hours to build. The details — flushing async tasks before the next operation, draining subprocess stderr to prevent pipe deadlocks, ordering middleware correctly so CORS preflight requests don't get rejected by auth — took days.

That ratio is normal in production systems. The lesson is to allocate time accordingly.
    `.trim(),
  },
  {
    slug: "observable-browser-sandbox",
    title: "Building an Observable Browser Sandbox",
    excerpt:
      "We needed a browser environment you could watch in real time, record as video, and control programmatically. Here's how we built it.",
    date: "2026-05-08",
    readingTime: "5 min read",
    category: "Architecture",
    content: `
Running a browser in a Docker container is easy. Making it observable — where a human can watch it in real time, where the agent can take screenshots, where test runs can be recorded as video — turns out to require a carefully layered stack.

We built the Hawkeye sandbox before we built the agent. The reasoning was simple: without an environment to test against, there's nothing to test. And without observability, debugging agent behavior would be guesswork.

## The Five-Layer Stack

The sandbox container runs five services simultaneously. A virtual display renders the browser to memory rather than a physical screen. A VNC server exposes that virtual display over the network. A WebSocket bridge makes VNC accessible from any browser tab. A noVNC viewer lets you watch the test run live in a browser window, without installing any client software.

Alongside that, a protocol proxy exposes the browser's internal debugging interface to the outside world. This is how the agent captures screenshots, monitors network requests, and reads console output — through a separate channel from the browser actions themselves.

And finally, when recording is enabled, a video encoder captures the virtual display continuously, encoding it to a standard video format that can be reviewed after the run.

## Two Protocols, One Browser

The most interesting architectural decision was using two separate protocols to communicate with the same browser instance.

The first protocol handles actions: clicking, typing, navigating, reading the page structure. It's abstracted at the browser level, which means the same agent code works with Chromium, Firefox, and WebKit without modification.

The second protocol handles observation: screenshots, network traffic, console messages, JavaScript evaluation. It connects to the browser's internal debugging interface directly.

The separation exists because neither protocol does everything. The action protocol is deliberately limited — it exposes the interactions a user would perform, not internal browser data. The debugging protocol fills those gaps.

The timing between them matters. During test setup, the agent navigates to the target page through the action protocol first, then connects the debugging session to the correct tab. Get that order wrong and the debugging session attaches to a blank tab.

## Why Live Viewing Matters

The noVNC live view turned out to be one of the most useful features we built, for reasons we didn't fully anticipate.

The obvious use is debugging: when a test fails, you can watch the replay and understand exactly what the agent saw and why it made the decisions it made. But the more valuable use is trust-building. When a stakeholder can watch an AI agent navigate their application in real time — clicking buttons, filling forms, scrolling through content — the abstract concept of "AI testing" becomes concrete and legible. The VNC view is how we explain what Hawkeye actually does.

## Container Isolation

Each test run gets its own container. There's no shared state between runs, no cookie persistence across tests, no risk of one test's actions affecting another. When the run completes, the container is destroyed and everything inside it disappears.

This isolation is what makes parallel execution safe. Two tests can run simultaneously against the same application without interfering with each other. The container pool pre-warms containers to eliminate the spawn latency — typically ten to fifteen seconds — from hot runs.
    `.trim(),
  },
  {
    slug: "hard-lessons-async-python",
    title: "Three Hard Lessons from Running Async Python in Production",
    excerpt:
      "Connection pools that break between tasks. Events that arrive a step late. Pipes that deadlock silently. Here's what we learned the hard way.",
    date: "2026-05-05",
    readingTime: "6 min read",
    category: "Engineering",
    content: `
Building Hawkeye involved a lot of async Python: an async web framework, an async database driver, an async job queue, and an async agent that runs for minutes at a time. Most of it worked smoothly. Three things did not, and each failure taught us something we hadn't known before.

## Lesson One: Connection Pools Don't Survive Event Loop Changes

The first time a background worker executed a test run, everything worked. The second time, it crashed with a cryptic error about a closed connection.

The root cause took a while to find. Our job queue uses a process model where each task creates a brand new event loop. The database connection pool was created during the first task's event loop. On the second task, the pool tried to reuse connections from the old, now-closed loop — and the database driver correctly rejected them.

The fix was conceptually simple once we understood the problem: don't pool connections across tasks. Use a pool that opens a fresh connection for every operation and closes it immediately. More overhead per query, but no cross-task state.

The same bug existed in the Redis client. The global connection singleton was bound to the first task's event loop. We fixed it by detecting when the current loop differs from when the connection was created, and recreating the connection pool when that happens.

The lesson: in a process-based task queue with asyncio, treat every task as a fresh process. Any connection created outside a task's event loop will eventually fail.

## Lesson Two: Scheduling a Task Is Not Executing It

Our live trace streaming system showed a strange symptom: every log event appeared one step late. The "observe" event showed up just as the "reason" phase started. The "reason" event appeared when "act" began.

The agent was working correctly. The streaming was working correctly. But there was a one-step lag that made the live feed feel disconnected from reality.

The root cause was a single line of code. When emitting a real-time event, we were scheduling the network publish rather than awaiting it. In Python's async model, a scheduled task only runs when the event loop gets control — which happens at the next await point. In our observe phase, the next await was the browser action call. In the reason phase, it was the LLM invocation.

The fix was a single zero-second sleep after each emit. This yields control to the event loop for one iteration, forcing all pending scheduled tasks to execute before the next operation begins. It's a pattern that appears in async Python documentation but is easy to miss in practice.

The lesson: scheduling and executing are not the same thing. If you need an async task to complete before the next operation, await it or explicitly yield to the event loop.

## Lesson Three: Always Drain Subprocess Output

On Windows, the agent would occasionally hang completely — no response from the browser control subprocess, no error message, just silence.

The cause was a 65-kilobyte pipe buffer. The browser control process was writing diagnostic messages to its error output. Nobody was reading them. When the buffer filled, the subprocess blocked on its next write attempt. Because output streams share the same underlying process, the main output channel stopped producing responses too.

The fix was a background task that continuously reads the error output for the lifetime of the subprocess, discarding or logging each line as it arrives. Simple, but easy to overlook.

The lesson generalizes beyond Windows: whenever you spawn a subprocess, read all its output streams, always. Unread output will eventually block the process, and the failure mode — silent hang with no error message — is one of the hardest to diagnose.

## The Pattern Across All Three

All three bugs shared a structure: a resource that worked correctly in isolation, failed silently when the environment changed, and took significant investigation to diagnose because the error message pointed to a symptom rather than a cause.

That's the nature of production async systems. The unit tests pass. The happy path works. The failures appear in the combination of concurrency, process model, and platform behavior that only shows up under real load. The best defense is aggressive logging and an understanding of where your runtime's assumptions can break.
    `.trim(),
  },
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
