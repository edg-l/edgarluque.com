+++
title = "Implementing a chat command in DDraceNetwork"
description = "A chat command that shows info about our player"
date = 2020-12-04
[taxonomies]
categories = ["DDraceNetwork", "cpp"]
+++

This is the part 3 of my series of articles about coding in DDraceNetwork, you can find the first article [here](/blog/intro-to-ddnet).

We will implement a command that shows info about our player: `/aboutme <times>`

Times will be how many times we print this info.

Go to `src/game/server/ddracechat.h`

Here you can see all the chat commands, they are created using a macro.

## The chat command macro

The macro looks like this:
```cpp
#define CHAT_COMMAND(name, params, flags, callback, userdata, help)
```

The first field is the name of the command, we will create a command called "aboutme".

The second field is the command parameters, it uses a special syntax:

Add a `?` if it's optional.

A `i` for integers, `s` for a string, `r` for "everything else".

You can give a hint by using `[]`, like `r[player name]` or possible values `?i['0'|'1'|'2']`.

The next field are the flags, for server-side chat commands they are always:
```cpp
CFGFLAG_CHAT | CFGFLAG_SERVER
```

Then comes the name of our method, usually prefixed by Con: `ConRules`.

Next field is userdata, always pass `this`.

Then comes the help text, put whathever you see fit.

We will use this command definition:

```cpp
CHAT_COMMAND("aboutme", "?i[times]", CFGFLAG_CHAT | CFGFLAG_SERVER, 
        ConAboutMe, this, "Show info about yourself");
```

## Adding the static method
We added `ConAboutMe` on the CHAT_COMMAND macro, now we need to implement it.

First go to `src/game/server/gamecontext.h` and under the last static Con command you see add it:

```cpp
// ...
static void ConFreezeHammer(IConsole::IResult *pResult, void *pUserData);
static void ConUnFreezeHammer(IConsole::IResult *pResult, void *pUserData);

// Here!
static void ConAboutMe(IConsole::IResult *pResult, void *pUserData);
```

## Implementing the chat command

Then to implement it we go to `src/game/server/ddracechat.cpp` and add it to the end:

```cpp
void CGameContext::ConAboutMe(IConsole::IResult *pResult, void *pUserData)
{
    /// The following code will be added here.
}
```

As you have seen, ConAboutMe is a static method, so in order to get hold of a CGameContext instance which lets us access all the information, we need to get it from `pUserData`.

```cpp
CGameContext *pSelf = (CGameContext *)pUserData;
```

Here `pResult` holds information about the caller client id, the number of arguments and how to get them.

Just to be on the safe side, we check that the ClientID we got is actually valid:

```cpp
if(!CheckClientID(pResult->m_ClientID))
    return;
```

> When you are new to the ddnet codebase, a really useful thing to do is to check how similar things you are doing are implemented, in our case there are a lot of other chat commands and just by looking at their implementations we can learn lot of things, like checking the client id, how to print to the console, chat, etc...

Now we will handle our optional argument "times", which tells us how many times we will print this information.

```cpp
int Times = 1;

if(pResult->NumArguments() > 0)
    Times = pResult->GetInteger(0);

if(Times < 1)
    Times = 1;
```

As you can see `pResult` has some handy methods, aside from those 2 seen in the snippet, you can also get a float, string and a color. You can find out more [here](https://github.com/ddnet/ddnet/blob/516c1cc59986fee338710c215a7dc0c9f318faec/src/engine/console.h#L37).

In our command we want to get the following information: name, client version, team and position.

The player is always present while the character is only present if the player has a physical body (the tee).

```cpp
const char *pName = pSelf->Server()->ClientName(pResult->m_ClientID);
int ClientVersion = pSelf->GetClientVersion(pResult->m_ClientID);
int Team = pSelf->GetDDRaceTeam(pResult->m_ClientID);
CPlayer *pPlayer = pSelf->m_apPlayers[pResult->m_ClientID];

// Check if it's null
if(!pPlayer)
{
    dbg_msg("chat-about-me", "Player not found!");
    return;
}
CCharacter *pChar = pPlayer->GetCharacter();

// Check if it's null
if(!pChar)
{
    dbg_msg("chat-about-me", "Character not found! Player may be dead or spectating.");
    return;
}
```

You can see we use `dbg_msg` to print debug messages, an alternative is to print to console, but I recommend using `dbg_msg`.

Some methods to get information may not be on the class CGameContext, for example with the player name, we had to access the IServer class with the method `Server()`.

That said, now we send the chat message:

```cpp
char aBuf[256];
str_format(aBuf, sizeof(aBuf),
        "Name: %s | "
        "ID: %d | "
        "Version: %d | "
        "Team: %d | "
        "Current position: %f, %f",
        pName,
        pResult->m_ClientID,
        ClientVersion,
        Team,
        pChar->m_Pos.x, pChar->m_Pos.y);

for(int i = 0; i < Times; i++)
{
    pSelf->SendChatTarget(pResult->m_ClientID, aBuf);
}
```

We format our message with `str_format` and send it with the method `SendChatTarget` and the client id we get from `pResult`.

And we can test it in the game:

![The result](/img/ddnet_chat_cmd.png)

## More to come
- Implementing a rcon command
- Adding configuration options to the client.
- Modify the menus to show a label and a button/checkbox/slider for the previously added options.
- Add a new network packet.
- Add a new map tile.
- Any other idea I may get in the future.
