// Mobile menu
const burger = document.getElementById('burger');
const navLinks = document.getElementById('navLinks');
if (burger) burger.addEventListener('click', () => navLinks.classList.toggle('open'));

// Footer year
const yr = document.getElementById('year');
if (yr) yr.textContent = new Date().getFullYear();

// Scroll-reveal animation
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('show')),
  { threshold: 0.15 }
);
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));