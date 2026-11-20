// The generated SDK starter's demo audio and UI are not used by this app.
import { rm } from 'node:fs/promises';
for (const name of ['dist/audio','dist/ui','dist/scenes/AGENTS.md']) await rm(name,{recursive:true,force:true});
