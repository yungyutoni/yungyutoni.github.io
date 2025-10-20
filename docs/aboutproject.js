  (function(){
    const doc = document.documentElement;
    function syncBg(){
      const max = (doc.scrollHeight - innerHeight) || 1;
      const p = Math.min(1, Math.max(0, scrollY / max));
      document.body.style.backgroundPosition = `center ${p*100}%`;
    }
    addEventListener('scroll', syncBg, {passive:true});
    addEventListener('resize', syncBg);
    syncBg(); // set initial position
  })();