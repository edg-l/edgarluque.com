+++
title = "New Programming Languages Have an AI Problem"
description = "AI coding assistants create a new adoption barrier for programming languages. Models trained on popular languages make newcomers harder to use, creating a self-reinforcing loop that's tough to break."
date = 2026-03-10
[taxonomies]
categories = ["programming-languages", "ai"]
+++

There's a playbook for getting a new programming language adopted. Find a niche, build a community, grow the ecosystem, get some corporate backing if you can. It's hard, but it works. Rust did it. Go did it. Kotlin did it. The path was known.

I think that path just got a lot harder, and the reason is AI.

## The old game

New languages always had barriers to overcome. No libraries. No Stack Overflow answers. No jobs. No IDE support. These were real problems, but they were solvable with time and effort. You could write the libraries yourself. You could answer the questions. You could convince a company to try it for a project.

The key thing about these barriers is that they were linear. More people using the language meant more libraries, which meant more people using the language. A virtuous cycle, and one that a motivated community could bootstrap.

## The new barrier

AI coding assistants are no longer a novelty. They're part of the toolchain. Ask any developer who uses Copilot or Claude daily. Going back to writing code without it feels like switching from an IDE to notepad.

Now try using one of these tools with a language that has a small corpus. You'll get hallucinated APIs, wrong idioms, suggestions that look right but aren't. The AI becomes actively misleading rather than helpful. And this isn't a minor inconvenience. It's a productivity tax. Every developer choosing a language is now implicitly weighing "how good is the AI support?" alongside the usual factors.

AI coding assistants are the new TIOBE index, except they actually affect outcomes.

## Why this one is different

The old barriers had a known escape route: just keep building. Write more libraries, answer more questions, make better tools. The community was in control.

The AI barrier is circular in a way that's harder to break out of. Models need training data. Training data comes from usage. Usage requires good AI support. Good AI support requires training data. You can see where this goes.

What makes it worse is that training data pipelines are controlled by a handful of companies. With the old barriers, a language community could directly address the problem. You write the library, you write the docs, you build the tool. With AI, you're dependent on OpenAI, Anthropic, or Google deciding your language is worth including in their next training run. And they'll prioritize what gets them the most users, which is... the languages people already use.

You can't really bootstrap your way out of this one the same way.

## I've been on the other side

I've written hobby programming languages. It's one of those things that teaches you a ton about compilers, type systems, and language design. There's a joy in crafting something that expresses ideas the way you want them expressed.

But there's a new feeling now that wasn't there a few years ago. You can design the most elegant language in the world, with a type system that catches bugs no other language catches, with syntax that makes complex ideas simple. And it won't matter. No AI will be good at it. Any developer who tries it will be fighting their tools instead of using them.

The gap between "technically interesting" and "practically adoptable" just got a lot wider.

## Is there hope?

Maybe. A few things could change the equation:

**Models that reason instead of pattern-match.** If AI gets better at understanding language grammars and semantics from first principles rather than just memorizing patterns from GitHub, then a small language with a well-written spec could get decent support without a massive corpus. We're not there yet, but it's not impossible.

**Language servers as an equalizer.** A good LSP implementation gives an AI structured information about types, completions, and diagnostics. This could partially compensate for a lack of training data. The model doesn't need to have memorized your language if it can query a language server that understands it. Some early work in this direction looks promising.

**Synthetic training data.** Language designers could generate large amounts of idiomatic code from their grammars and type systems. It's not the same as real-world code, but it might be enough to get a model past the "hallucinating everything" stage.

**AI-friendly specs.** A well-written, machine-readable language specification could go a long way. If your grammar is formally defined, your semantics are precise, and your spec is structured in a way that an AI can consume, you're giving models a shortcut past the "learn from a million repos" approach. Most languages have specs written for humans. Writing one that's also useful for AI might become a real competitive advantage.

**Niches where AI matters less.** Embedded systems, formal verification, specific domains where correctness matters more than velocity. If your language targets a space where developers aren't relying on AI autocomplete, the barrier disappears.

But here's the thing. Language designers now need an "AI adoption strategy" alongside their language spec. That's a sentence that would've sounded absurd five years ago.

## The uncomfortable question

Are we watching the programming language landscape stagnate? Are we approaching a world where the languages we have now are the languages we're stuck with?

There's a real irony here. AI is supposed to be the most innovative, disruptive technology of our time. And one of its side effects might be freezing the programming world in place, making it harder for new ideas to get a foothold. The most revolutionary technology in software might be the thing that stops programming languages from evolving.

I don't have a clean answer. Maybe the AI companies will solve this as models get smarter. Maybe someone will figure out how to bootstrap a language's AI support the way we used to bootstrap ecosystems. Maybe this barrier will turn out to be temporary.

But right now, if you're designing a new programming language, you're not just competing against Python, Rust, and Go for mindshare. You're competing against the entire training corpus of every major AI model. And that's a fight that's very hard to win.
