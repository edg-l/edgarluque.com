+++
title = "What's new in Python 3.9"
description = "A list of major new features in python 3.9"
date = 2020-11-10
+++

## Python 3.9
Python 3.9 has been released on October 5, 2020.


## Add Union Operators To dict (PEP 584)

This allows the union operation to be performed on dicts:

```python
>>> a = {'x': 1, 'y': 2, 'z': 3}
>>> e = {'w': 'hello world'}
>>> a | e
{'x': 1, 'y': 2, 'z': 3, 'w': 'hello world'}
```

And also:
```python
>>> x = a
>>> x
{'x': 1, 'y': 2, 'z': 3}
>>> x |= e
>>> x
{'x': 1, 'y': 2, 'z': 3, 'w': 'hello world'}
```

## Type Hinting Generics In Standard Collections (PEP 585)
This feature enables type hinting using the standard collections without having to rely on the `typings` module.

Previously to type hint a list you would do:

```python
from typings import List

def somefunc(a: List[int]):
    pass
```

Now you can use the standard type:
```python

def somefunc(a: list[int]):
    pass
```

From this version, importing **collections** from `typings` is deprecated, and they will be removed in 5 years.

## Flexible function and variable annotations (PEP 593)
This feature adds a new type `Annotated` which allows us to extend type annotations with metadata.

This allows a type `T` to be annotated with metadata `x` like so:

```python
T1 = Annotated[T, x]

# E.g
UnsignedShort = Annotated[int, struct2.ctype('H')]
SignedChar = Annotated[int, struct2.ctype('b')]

# Multiple type annotations are supported
T2 = Annotated[int, ValueRange(3, 10), ctype("char")]
```

The metadata can then be used for static or runtime analysis with tools such as [mypy](http://www.mypy-lang.org/)

This feature allows authors to introduce new data types with graceful degradation,
for example if mypy doesn't know how to parse X Annotation it should just ignore its metadata and use the annotated type.

## Relaxing Grammar Restrictions On Decorators (PEP 614)
Python currently requires that all decorators consist of a dotted name, optionally followed by a single call. This PEP proposes removing these limitations and allowing decorators to be any valid expression.

An expression here means "anything that's valid as a test in if, elif, and while blocks".

Basically this:

```python
button_0 = buttons[0]

@button_0.clicked.connect
def spam():
    pass
```

Can now be:
```python
@buttons[0].clicked.connect
def spam():
    pass
```

## Support for the IANA Time Zone Database in the Standard Library
This feature adds a new module `zoneinfo` that provides a concrte time zone implementation supporting the IANA time zone database.

You can find more about this module here: [zoneinfo](https://docs.python.org/3/library/zoneinfo.html)

Example:

```python
>>> from zoneinfo import ZoneInfo
>>> from datetime import datetime, timedelta

>>> dt = datetime(2020, 10, 31, 12, tzinfo=ZoneInfo("America/Los_Angeles"))
>>> print(dt)
2020-10-31 12:00:00-07:00

>>> dt.tzname()
'PDT'
```

## String methods to remove prefixes and suffixes
Adds two new methods, [removeprefix()](https://docs.python.org/3/library/stdtypes.html?highlight=removeprefix#str.removeprefix) and [removesuffix()](https://docs.python.org/3/library/stdtypes.html?highlight=removeprefix#str.removesuffix), to the APIs of Python's various string objects.