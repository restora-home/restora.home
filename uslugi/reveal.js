(function(){
  var els = [].slice.call(document.querySelectorAll('.reveal, .reveal-stagger'));
  if(!els.length) return;
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){ entry.target.classList.add('in-view'); io.unobserve(entry.target); }
    });
  }, { threshold: 0.1 });
  els.forEach(function(el){ io.observe(el); });
})();
