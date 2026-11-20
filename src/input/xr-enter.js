/** The Enter VR click (round 8, Q07). The browser starts an XR session only inside a user activation (the click). The session request is the FIRST thing the click
 * does, in the same task: no await, no timer, no earlier step. If the table is not built yet the click does nothing but say so (the button stays disabled until
 * the table is ready, see flat-ui.ts setReady); a request made later, outside the click, would be refused. Pure. */
/** @param {{getWorld: () => any, begin: () => void, startAudio: () => void, say: (text: string) => void}} deps */
export function createEnterVr({ getWorld, begin, startAudio, say }) {
  return {
    click() {
      const world = getWorld();
      if (!world) { say("One moment: the table is loading."); return false; }
      begin();
      try {
        world.launchXR(); // calls navigator.xr.requestSession synchronously (IWSDK init/xr.ts launchXR)
      } finally {
        startAudio(); // after the request, still inside the click (the audio context needs the activation too)
      }
      return true;
    },
  };
}
