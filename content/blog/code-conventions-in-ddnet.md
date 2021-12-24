+++
title = "Code conventions in DDraceNetwork"
description = "The code conventions enforced by DDraceNetwork."
date = 2020-11-28
[taxonomies]
categories = ["DDraceNetwork", "cpp"]
+++

This is the part 2 of my series of articles about coding in DDraceNetwork, you can find the previous one [here](/blog/intro-to-ddnet).

## What are coding conventions?
They are a set of rules that dictate how the code should be written, so that the code style is consistent among the codebase.

## DDNet naming conventions

*Note: There is an ongoing discussion about variable naming, find out more [here](https://github.com/ddnet/ddnet/issues/2945).*

Currently, this is how we name things:

## Classes and structs
They are prefixed with `C` and followed by a capital letter, like `CController`, if the class is meant to be an interface it is prefixed by `I`.

## Enum constants
They must be all screaming snake case like: `MAX_PLAYERS`.

## Variable naming

The name is divided in 3 parts: qualifier, prefix and name.

Common qualifiers: `m` for member variables, `s` for static variables.

There is also `g` for global variables with external linkage.

If, the qualifier is not empty it is followed by an underscore.

Example: `ms_YourVariable`.

There are 2 common type prefixes: `p` for pointers, `a` for arrays and `fn` for functions, note that you can stack the prefixes for example in the case of a pointer to a pointer.

Example: `pMyPointer`, `aBuf`, `ppArgs`, `m_pCharacter`, `m_pfnMyCallback`, `m_papfnMyPointerToArrayOfCallbacks`

The first letter of the variable must be uppercase.

## Common idioms.
The following snippet is very common in ddnet code:

```cpp
char aBuf[128];
str_format(aBuf, sizeof(aBuf), "number: %d", 2);
```

This is how we format strings, and it's used everywhere (str_format is defined in system.h).

I will add more here when I find/remember more.

## More to come
- [Implementing a chat command](/blog/chat-command-ddracenetwork)
- Implementing a rcon command
- Adding configuration options to the client.
- Modify the menus to show a label and a button/checkbox/slider for the previously added options.
- Add a new network packet.
- Add a new map tile.
- Any other idea I may get in the future.