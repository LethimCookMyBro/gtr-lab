const sources = {
 hero: 'https://media.flixel.com/cinemagraph/7x5domma49p8pb7z8k1l?hd=true',
 detail: 'https://media.flixel.com/cinemagraph/t53p8d1vu4miy763a938?hd=true',
};
document.querySelector('#wide').onclick = () => document.body.classList.remove('phone');
document.querySelector('#phone').onclick = () => document.body.classList.add('phone');
const cards = [...document.querySelectorAll('.card')];
const userStopped = new WeakSet();
const mayAuto = () => !matchMedia('(prefers-reduced-motion: reduce)').matches && !navigator.connection?.saveData;
function stop(card) { card.querySelector('iframe')?.remove(); card.querySelector('.toggle').textContent='Play film';card.querySelector('.state').textContent='Player unloaded'; }
function play(card) { if(document.visibilityState==='hidden')return;const frame=document.createElement('iframe');frame.src=sources[card.dataset.film];frame.title=card.querySelector('h2').textContent;frame.allow='autoplay; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';frame.onload=()=>{if(frame.isConnected)card.querySelector('.state').textContent='Provider document loaded; visible playback must be verified';};card.querySelector('.viewport').append(frame);card.querySelector('.toggle').textContent='Stop film';card.querySelector('.state').textContent='Loading provider document'; }
for(const card of cards){card.querySelector('.toggle').onclick=()=>{if(card.querySelector('iframe')){userStopped.add(card);stop(card);}else{userStopped.delete(card);play(card);}};}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')cards.forEach(stop);});
const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)stop(entry.target);else if(mayAuto()&&!userStopped.has(entry.target)&&!entry.target.querySelector('iframe'))play(entry.target);}},{threshold:.1});cards.forEach(card=>observer.observe(card));
