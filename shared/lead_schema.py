"""Shared lead schema placeholder.

Replace with a typed schema/dataclass as integration proceeds.
"""

from dataclasses import dataclass


@dataclass(slots=True)
class Lead:
    platform: str
    handle: str
    profile_url: str
    captured_at_iso: str
