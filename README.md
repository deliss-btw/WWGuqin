Wuthering Waves Guqin Simulator

Run with a local HTTP server, for example:
    python -m http.server 8000

Then open:
    http://localhost:8000

# AUDIO
Format: OGG Vorbis (.ogg)
Note samples: audio/note/c4.ogg ... audio/note/b2.ogg
Harmonic samples: audio/harmonic/c4.ogg ... audio/harmonic/b2.ogg

# GAME TRACK FORMAT
Kinda like that:

```
[
  {
    "Id": 800001,
    "InstrumentType": 0,
    "Description": "",
    "QteSequence": "[[0,0],[1,2],[2,6]]",
    "PreludeAsset": "/Game/..."
  }
]
```

# CUSTOM TRACKS

The Custom Track tab can record a sequence by listening to the same piano/guqin keys used by Free Play. The sequence can be edited with Undo/Clear and then saved in the browser... yada yada yada

# SHARE CODE FORMAT

Share codes use a versioned prefix: GQ1:<base64url>

The payload is UTF-8 JSON encoded as Base64URL. v1 payload:
```
  {
    "v": 1,
    "n": "My melody",
    "s": [[0,0],[1,2],[2,6]]
  }
```
v = format version; n = user-visible track name; s = note sequence as [row,column] pairs

# CUSTOM JSON IMPORT
The site can also import a single custom QTE object or an array of them.
Accepted shapes include: 
    {"name":"My track","sequence":[[0,0],[1,2]]}

and game-like:
    {"Description":"My track","QteSequence":"[[0,0],[1,2]]"}
