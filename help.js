/* Help center: live search over the articles, and the table of contents follows the scroll. */
(function () {
  'use strict';
  var arts = Array.prototype.slice.call(document.querySelectorAll('article.h'));
  var links = Array.prototype.slice.call(document.querySelectorAll('.htoc a'));
  var q = document.getElementById('hq');
  q.addEventListener('input', function () {
    var t = q.value.trim().toLowerCase();
    arts.forEach(function (a) { a.hidden = !!t && a.textContent.toLowerCase().indexOf(t) < 0; });
  });
  if (!('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      links.forEach(function (l) { l.classList.toggle('on', l.getAttribute('href') === '#' + e.target.id); });
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  arts.forEach(function (a) { io.observe(a); });
})();
