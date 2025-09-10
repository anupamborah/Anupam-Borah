(function(){
  const section = document.querySelector('[data-section-id]');
  if(!section) return;

  const modal = section.querySelector('[data-modal]');
  const overlay = section.querySelector('[data-modal-overlay]');
  const closeBtn = section.querySelector('[data-modal-close]');
  const titleEl = section.querySelector('[data-modal-title]');
  const priceEl = section.querySelector('[data-modal-price]');
  const descEl = section.querySelector('[data-modal-desc]');
  const imageEl = section.querySelector('[data-modal-image]');
  const optionsRoot = section.querySelector('[data-options]');
  const form = section.querySelector('[data-variants-form]');
  const qtyInput = form.querySelector('input[name="quantity"]');
  const sizeDropdown = form.querySelector('[data-size-dropdown]');
  const statusEl = form.querySelector('[data-status]');

  const MONEY_FORMAT = document.documentElement.getAttribute('lang') === 'en' ? 'money' : 'money_with_currency'; // simple
  const fmtMoney = (cents) => {
    return (cents/100).toLocaleString(undefined, {style:'currency', currency: (Shopify && Shopify.currency && Shopify.currency.active) || 'USD'});
  };

  let currentProduct = null; 
  let selectedOptions = [];  

  // Utility: find variant by selected options
  function findVariantByOptions(product, options){
    return product.variants.find(v => {
      return v.options.every((val, idx) => String(val) === String(options[idx]));
    });
  }

  // Build option chips + size dropdown
  function renderOptions(product){
    optionsRoot.innerHTML = '';
    selectedOptions = product.options.map(()=>'');

    product.options.forEach((optName, idx) => {
      const row = document.createElement('div');
      row.className = 'ee-option-row';
      const label = document.createElement('label');
      label.textContent = optName;
      row.appendChild(label);

      // Collect unique values for this index
      const values = Array.from(new Set(product.variants.map(v => v.options[idx])));

      // If this option is "Size" → dropdown
      if (optName.toLowerCase().includes('size')) {
        sizeDropdown.innerHTML = '<option disabled selected>Choose your size</option>';
        values.forEach(val => {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = val;
          sizeDropdown.appendChild(opt);
        });
        sizeDropdown.onchange = () => {
          selectedOptions[idx] = sizeDropdown.value;
          updatePriceStock();
        };
      } else {
        // Otherwise render as chips
        values.forEach(val => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'ee-chip';
          chip.textContent = val;
          chip.dataset.value = val;
          chip.addEventListener('click', () => {
            const siblings = row.querySelectorAll('.ee-chip');
            siblings.forEach(s => s.dataset.selected = 'false');
            chip.dataset.selected = 'true';
            selectedOptions[idx] = val;
            updatePriceStock();
          });
          row.appendChild(chip);
        });
        optionsRoot.appendChild(row);
      }
    });

    // Default preselect first values for non-size options
    optionsRoot.querySelectorAll('.ee-option-row').forEach((row, idx) => {
      const first = row.querySelector('.ee-chip');
      if(first){ first.click(); }
    });
  }

  function updatePriceStock(){
    const variant = findVariantByOptions(currentProduct, selectedOptions);
    if(!variant) {
      priceEl.textContent = 'Unavailable';
      return;
    }
    priceEl.textContent = fmtMoney(variant.price);
  }

  function openModal(product){
    currentProduct = product;

    const img = (product.images && product.images[0]) || product.featured_image;
    if(img){ imageEl.src = img.src || img; } else { imageEl.removeAttribute('src'); }

    titleEl.textContent = product.title;
    descEl.innerHTML = product.body_html || '';
    priceEl.textContent = fmtMoney(product.price_min);

    if(product.options && product.options.length){
      renderOptions(product);
    } else {
      optionsRoot.innerHTML = ''; 
      selectedOptions = [];
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(){
    modal.setAttribute('aria-hidden', 'true');
    modal.hidden = true;
    document.body.style.overflow = '';
    currentProduct = null;
    statusEl.textContent = '';
  }

  // Click handlers
  section.querySelectorAll('.ee-card').forEach(card => {
    const hotspot = card.querySelector('.ee-hotspot');
    const jsonEl = card.querySelector('.ee-product-json');
    if(!hotspot || !jsonEl) return;
    const productData = JSON.parse(jsonEl.textContent);
    hotspot.addEventListener('click', () => openModal(productData));
  });

  overlay.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') closeModal();
  });

  async function addToCart(variantId, quantity){
    const res = await fetch('/cart/add.js', {
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify({ id: variantId, quantity })
    });
    if(!res.ok) throw new Error('Add to cart failed');
    return res.json();
  }

  // Auto-add logic
  function shouldTriggerAutoAdd(variant){
    if(!variant || !Array.isArray(variant.options)) return false;
    const vals = variant.options.map(String);
    return vals.includes('Black') && vals.includes('Medium');
  }

  function getAutoProduct(){
    const autoEl = section.querySelector('.ee-auto-product-json');
    if(!autoEl) return null;
    try { return JSON.parse(autoEl.textContent); } catch { return null; }
  }

  function firstAvailableVariant(product){
    if(!product || !product.variants) return null;
    return product.variants.find(v => v.available) || product.variants[0] || null;
  }

  // Submit form
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!currentProduct){ return; }
    statusEl.textContent = 'Adding…';

    const qty = Math.max(1, parseInt(qtyInput?.value || '1', 10));
    const variant = currentProduct.options?.length ? findVariantByOptions(currentProduct, selectedOptions) : (currentProduct.variants && currentProduct.variants[0]);

    if(!variant){
      statusEl.textContent = 'Please select available options.';
      return;
    }
    if(variant.available === false){
      statusEl.textContent = 'This variant is out of stock.';
      return;
    }

    try{
      await addToCart(variant.id, qty);

      if(shouldTriggerAutoAdd(variant)){
        const autoProduct = getAutoProduct();
        const autoVariant = firstAvailableVariant(autoProduct);
        if(autoVariant){
          try { await addToCart(autoVariant.id, 1); } catch (err) { /* ignore */ }
        }
      }

      statusEl.textContent = 'Added! View your cart to checkout.';
    } catch(err){
      statusEl.textContent = 'Error adding to cart. Please try again.';
    }
  });
})();
