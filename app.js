const products = [
  {id:1,name:'Form high-rise legging',detail:'Sculpting · 7/8 length',category:'Leggings',price:32500,color:'Black',badge:'Bestseller',image:'photo-1506629082955-511b1aa562c8',swatches:['#292a28','#888b78','#b7aaa0']},
  {id:2,name:'Everyday studio bra',detail:'Light support · Soft touch',category:'Tops',price:18500,color:'Olive',badge:'New in',image:'photo-1549060279-7e168fcee0c2',swatches:['#777c62','#242522','#b7aaa0']},
  {id:3,name:'Cloud-knit training top',detail:'Second-skin · Breathable',category:'Tops',price:22000,color:'Stone',badge:'',image:'photo-1518310383802-640c2de311b2',swatches:['#d0cabe','#292a28','#a9a891']},
  {id:4,name:'Move with ease shorts',detail:'High-rise · 5 inch inseam',category:'Leggings',price:24500,color:'Black',badge:'',image:'photo-1518611012118-696072aa579a',swatches:['#292a28','#888b78','#634d59']},
  {id:5,name:'Studio grip socks',detail:'Cushioned · One size',category:'Accessories',price:8500,color:'Stone',badge:'',image:'photo-1518611012118-696072aa579a',swatches:['#dedbd1','#292a28']},
  {id:6,name:'Sculpt cross-back bra',detail:'Medium support · Seamless',category:'Tops',price:21000,color:'Plum',badge:'Just landed',image:'photo-1517836357463-d25dfeac3438',swatches:['#634d59','#292a28','#888b78']},
  {id:7,name:'Daily form flare legging',detail:'Full length · Buttery soft',category:'Leggings',price:36500,color:'Olive',badge:'',image:'photo-1538805060514-97d9cc17730c',swatches:['#888b78','#292a28','#b7aaa0']},
  {id:8,name:'Everywhere carryall',detail:'Recycled canvas · 24L',category:'Accessories',price:28500,color:'Stone',badge:'',image:'photo-1544816155-12df9643f363',swatches:['#b7aaa0','#292a28','#888b78']}
];
const money = n => '₦' + n.toLocaleString('en-NG');
let cart = JSON.parse(localStorage.getItem('bellisima-cart') || '[]');
let category = 'All';
let color = 'All';
const grid = document.getElementById('productGrid');
function renderProducts(){
  let list=products.filter(p=>(category==='All'||p.category===category)&&(color==='All'||p.color===color));
  const sort=document.getElementById('sortSelect').value;
  if(sort==='low') list.sort((a,b)=>a.price-b.price); if(sort==='high') list.sort((a,b)=>b.price-a.price);
  grid.innerHTML=list.map(p=>`<article class="product-card"><div class="product-image"><img loading="lazy" src="https://images.unsplash.com/${p.image}?auto=format&fit=crop&w=800&q=80" alt="${p.name}">${p.badge?`<span class="product-badge">${p.badge}</span>`:''}<button class="quick-add" data-add="${p.id}">Add to bag <span>＋</span></button></div><div class="product-info"><div><p class="product-name">${p.name}</p><p class="product-detail">${p.detail}</p><div class="swatches">${p.swatches.map(s=>`<span class="swatch" style="background:${s}"></span>`).join('')}</div></div><span class="product-price">${money(p.price)}</span></div></article>`).join('');
}
function renderCart(){
  const count=cart.reduce((n,x)=>n+x.qty,0); document.getElementById('bagCount').textContent=count; document.getElementById('drawerCount').textContent=`(${count})`;
  const content=document.getElementById('cartContent'), foot=document.getElementById('cartFoot');
  if(!cart.length){content.innerHTML='<div class="empty-cart"><div class="empty-icon">✳</div><h3>Your bag is taking a breather.</h3><p>Find something that moves you.</p><a class="text-link" href="#shop" data-close>Shop the collection <span>↗</span></a></div>';foot.innerHTML='';return}
  content.innerHTML=cart.map(x=>`<div class="cart-row"><img src="https://images.unsplash.com/${x.image}?auto=format&fit=crop&w=200&q=75" alt=""><div><h3>${x.name}</h3><p>${x.detail}</p><div class="qty-controls"><button data-qty="${x.id}" data-step="-1" aria-label="Decrease quantity">−</button><span>${x.qty}</span><button data-qty="${x.id}" data-step="1" aria-label="Increase quantity">+</button><button class="remove-item" data-remove="${x.id}">Remove</button></div></div><span class="cart-row-price">${money(x.price*x.qty)}</span></div>`).join('');
  let subtotal=cart.reduce((n,x)=>n+x.price*x.qty,0);foot.innerHTML=`<div class="subtotal"><span>Subtotal</span><span>${money(subtotal)}</span></div><p class="shipping-note">Shipping calculated at checkout. You’re ${money(Math.max(0,75000-subtotal))} away from free delivery.</p><button class="button button-dark" id="checkoutButton">Continue to checkout <span>→</span></button>`;
}
function persist(){localStorage.setItem('bellisima-cart',JSON.stringify(cart));renderCart()}
function toast(message){let t=document.getElementById('toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2100)}
function addProduct(id){const p=products.find(x=>x.id===id),found=cart.find(x=>x.id===id);if(found)found.qty++;else cart.push({...p,qty:1});persist();toast(`${p.name} added to your bag`)}
const overlay=document.getElementById('overlay'),drawer=document.getElementById('cartDrawer'),auth=document.getElementById('authModal');
function showPanel(panel){overlay.classList.add('open');panel.classList.add('open');panel.setAttribute('aria-hidden','false');document.body.style.overflow='hidden'}
function closePanels(){overlay.classList.remove('open');[drawer,auth].forEach(p=>{p.classList.remove('open');p.setAttribute('aria-hidden','true')});document.body.style.overflow=''}
document.addEventListener('click',e=>{
  const add=e.target.closest('[data-add]');if(add){addProduct(Number(add.dataset.add));return}
  const cat=e.target.closest('[data-category]');if(cat){category=cat.dataset.category;document.querySelectorAll('.category').forEach(x=>x.classList.toggle('active',x===cat));renderProducts();return}
  const qty=e.target.closest('[data-qty]');if(qty){const item=cart.find(x=>x.id===Number(qty.dataset.qty));item.qty+=Number(qty.dataset.step);if(item.qty<=0)cart=cart.filter(x=>x!==item);persist();return}
  const remove=e.target.closest('[data-remove]');if(remove){cart=cart.filter(x=>x.id!==Number(remove.dataset.remove));persist();return}
  if(e.target.closest('[data-close]')){closePanels();return}
  if(e.target.closest('#cartOpen')){renderCart();showPanel(drawer);return}
  if(e.target.closest('#accountOpen')){showPanel(auth);return}
  if(e.target===overlay)closePanels();
  if(e.target.closest('#filterToggle'))document.getElementById('filterPanel').classList.toggle('show');
  if(e.target.closest('#checkoutButton'))toast('Checkout is ready to connect to your store backend.');
  if(e.target.closest('.search-toggle')){let query=prompt('Search the Bellisima collection');if(query){const match=products.find(p=>p.name.toLowerCase().includes(query.toLowerCase()));if(match){category='All';document.querySelectorAll('.category').forEach(x=>x.classList.toggle('active',x.dataset.category==='All'));renderProducts();document.getElementById('shop').scrollIntoView();toast(`Showing ${match.name}`)}else toast('No pieces found. Try another search.')}}
});
document.getElementById('sortSelect').addEventListener('change',renderProducts);
document.getElementById('colorSelect').addEventListener('change',e=>{color=e.target.value;renderProducts()});
document.querySelectorAll('[data-category-link]').forEach(a=>a.addEventListener('click',()=>{category='All';renderProducts()}));
document.getElementById('googleLogin').addEventListener('click',()=>{document.getElementById('authMessage').textContent='Connect Google OAuth credentials to enable sign in.'});
document.getElementById('loginForm').addEventListener('submit',e=>{e.preventDefault();document.getElementById('authMessage').textContent='You’re all set to connect this form to your authentication service.'});
renderProducts();renderCart();
