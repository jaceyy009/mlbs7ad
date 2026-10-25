#!/usr/bin/env python3
"""Build a stable ICS subscription feed from data/episodes.json."""
from datetime import datetime, timezone, timedelta
from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "episodes.json"
OUTPUT = ROOT / "calendar-feed.ics"
ACTIVE = {"confirmed", "scheduled", "aired"}

def esc(value):
    return str(value or "").replace("\\", "\\\\").replace("\r", "").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")

def timestamp(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None

def ics_dt(value):
    return value.strftime("%Y%m%dT%H%M%SZ")

def fold(line):
    # RFC 5545 recommends lines no longer than 75 octets; this simple fold is
    # character-safe for the UTF-8 text used in this project's feed.
    out=[]
    while len(line.encode("utf-8")) > 74:
        cut=min(70, len(line))
        while len(line[:cut].encode("utf-8")) > 70:
            cut-=1
        out.append(line[:cut]); line=" "+line[cut:]
    out.append(line)
    return out

def main():
    data=json.loads(DATA.read_text(encoding="utf-8"))
    lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//MLB S7 Air Dates//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:Miraculous Ladybug Season 7 Air Dates","X-WR-TIMEZONE:UTC"]
    now=datetime.now(timezone.utc)
    for episode in data.get("episodes", []):
        if not isinstance(episode, dict): continue
        for airing in episode.get("airings", []):
            if not isinstance(airing, dict): continue
            status=str(airing.get("status") or ("confirmed" if airing.get("confirmed") is True else "unconfirmed")).lower()
            if status not in ACTIVE: continue
            start=timestamp(airing.get("firstAirUtc"))
            if not start: continue
            langs=airing.get("dub", airing.get("dubs", airing.get("languages", airing.get("language", []))))
            if not isinstance(langs, list): langs=[langs]
            regions=airing.get("regions", airing.get("region", airing.get("country", [])))
            if not isinstance(regions, list): regions=[regions]
            epnum=episode.get("number", episode.get("id", "?"))
            title=f"Miraculous S7 Episode {epnum}" + (f" - {episode['title']}" if episode.get("title") else "")
            desc="Channel: {}\nLanguages: {}\nRegions: {}\nStatus: {}\nSource: {}".format(airing.get("channel","Not specified"), ", ".join(map(str, langs)), ", ".join(map(str, regions)), status.title(), airing.get("source","Not supplied"))
            uidbase=f"{episode.get('id',epnum)}-{int(start.timestamp())}-{re.sub(r'[^a-z0-9]', '', str(airing.get('channel','channel')).lower())}-{re.sub(r'[^a-z0-9]', '', '-'.join(map(str, langs)).lower())}-{re.sub(r'[^a-z0-9]', '', '-'.join(map(str, regions)).lower())}"
            lines += ["BEGIN:VEVENT",f"UID:{esc(uidbase)}@mlb-s7-airdates",f"DTSTAMP:{ics_dt(now)}",f"DTSTART:{ics_dt(start)}",f"DTEND:{ics_dt(start+timedelta(minutes=30))}",f"SUMMARY:{esc(title)}",f"DESCRIPTION:{esc(desc)}"]
            if isinstance(airing.get("source"), str) and airing["source"].startswith(("https://", "http://")):
                lines.append(f"URL:{esc(airing['source'])}")
            lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    OUTPUT.write_text("\r\n".join(part for line in lines for part in fold(line))+"\r\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.name} from {DATA.name}")

if __name__ == "__main__": main()
