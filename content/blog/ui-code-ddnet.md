+++
title = "UI Code in DDraceNetwork"
description = "Some kind of tutorial into how to use this mess."
date = 2023-05-19
[taxonomies]
categories = ["DDraceNetwork", "cpp"]
+++

This is some kind of guide into how the UI code works in DDNet.

Probably can be considered part 1, in case I continue it.

Foremost, since this is a game, the UI is rendered using [immediate mode](https://en.wikipedia.org/wiki/Immediate_mode_GUI), which means, every render tick, the logic on whether something is hovered, rendered, clicked, etc is done. There are some optimizations around this, DDNet uses text containers to cache the rendered text texture for example.

## UI Client Class

The UI client class defined in `src/game/client/ui.h` holds most of the related methods aiding at rendering the UI, for example `bool MouseInside(const CUIRect *pRect) const;` to know whether the mouse is
inside the passed `CUIRect`.

Talking about `CUIRect`, they are the most important structure, using them, elements are placed on the screen, by using a combination of methods to "split" the rect into smaller rects where UI components will be placed, this can be done with the methods the `CUIRect` class has.

As the name suggests, it's quite a simple class, holding the `x`, `y`, `w` and `h` values, corresponding to the coordinates of the top left point of the rectangle, and the width and height.

## HSplitMid and variants

```cpp

/**
 * Splits 2 CUIRect inside *this* CUIRect horizontally. You can pass null pointers.
 *
 * @param pTop This rect will end up taking the top half of this CUIRect.
 * @param pBottom This rect will end up taking the bottom half of this CUIRect.
 * @param Spacing Total size of margin between split rects.
 */
void HSplitMid(CUIRect *pTop, CUIRect *pBottom, float Spacing = 0.0f) const;
```

As the method explains, it places the `pTop` rect at the top half of the `this` instance of rect (the method caller), and the `pBottom` at the bottom half, with the given spacing.

```cpp
CUIRect MyTopButton;
CUIRect MyBottomButton;
MainView.HSplitMid(&MyTopButton, &MyBottomButton);

static CButtonContainer s_MyTopButton;
if(DoButton_Menu(&s_MyTopButton, Localize("Top Button"), 0, &MyTopButton, 0, IGraphics::CORNER_ALL, 5.0f, 0.0f, vec4(0.0f, 0.0f, 0.0f, 0.9f), vec4(0.0f, 0.0f, 0.0f, 0.7f)))
{
    dbg_msg("tutorial", "top button pressed!");
}

static CButtonContainer s_MyBottomButton;
if(DoButton_Menu(&s_MyBottomButton, Localize("Bottom Button"), 0, &MyBottomButton, 0, IGraphics::CORNER_ALL, 5.0f, 0.0f, vec4(0.0f, 0.0f, 0.0f, 0.9f), vec4(0.0f, 0.0f, 0.0f, 0.7f)))
{
    dbg_msg("tutorial", "bottom button pressed!");
}
```

![](/img/ddnet_ui_hsplit.png)

With `VSplitMid` instead:

![](/img/ddnet_ui_vsplit.png)

In addition to `(V|H)SplitMid` there is also `(V|H)Split(Bottom|Top)`, they allow making one of the split rects take a different size, for example,
given a rect of height 400, using `HSplitBottom` and giving `Cut` a value of 100, will make the bottom rect have a height of 100, and the top rect have a height of 300.

Knowing this, we can easily add another button to the start menu in `menu_start.cpp:129`:

```cpp
// Using HSplitBottom this way, we reduce the Menu rect height by 100.
Menu.HSplitBottom(100.0f, &Menu, 0);

// our new button, will have a height of 40, and reduces the height of Menu by 40.
Menu.HSplitBottom(40.0f, &Menu, &Button);
static CButtonContainer s_MyMenuButton;
if(DoButton_Menu(&s_MyMenuButton, Localize("My Button!"), 0, &Button, 0, IGraphics::CORNER_ALL, Rounding, 0.5f, vec4(0.0f, 0.0f, 0.0f, 0.5f), vec4(0.0f, 0.0f, 0.0f, 0.25f)))
{
    // do something once pressed
}

// add a bit of margin, i.e, reduce the height of Menu by 5
Menu.HSplitBottom(5.0f, &Menu, 0); // little space

// this code already existed, adding it for reference
Menu.HSplitBottom(40.0f, &Menu, &Button);
static CButtonContainer s_SettingsButton;
if(DoButton_Menu(&s_SettingsButton, Localize("Settings"), 0, &Button, g_Config.m_ClShowStartMenuImages ? "settings" : 0, IGraphics::CORNER_ALL, Rounding, 0.5f, vec4(0.0f, 0.0f, 0.0f, 0.5f), vec4(0.0f, 0.0f, 0.0f, 0.25f)) || CheckHotKey(KEY_S))
    NewPage = PAGE_SETTINGS;
```

Result:

![](/img/ddnet_ui_button.png)

More to come soon.
