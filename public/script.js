// Complete F1-F7. Use your PA1 display/validation ideas, but the server owns data.
const byId=id=>document.getElementById(id);
let csrfToken=null;
let editingId=null;
let purchases=[]; // Display cache only. Do not use this as persistent storage.
const form=byId('purchase-form');
const message=byId('message');
const saveButton=byId('save-button');
function money(cents){return '$'+(cents/100).toFixed(2);}

async function refreshCsrf(){
  const response=await fetch('/api/csrf',{credentials:'same-origin'});
  if(!response.ok) throw new Error('Could not initialize the session');
  csrfToken=(await response.json()).csrfToken;
}

async function api(path,options={}) {
  // F1: await refreshCsrf if needed; build headers and credentials:'same-origin'.
  // If options.body is an object, JSON.stringify it and set Content-Type.
  // Add X-CSRF-Token on mutations; fetch; parse JSON; throw Error on !response.ok.
  // Use try/catch to give a useful connection error only for actual network failure.
  // Preserve server-provided error messages for HTTP failures.
  const method = options.method || 'GET';
  const headers = {};

  if (options.body !== undefined && typeof options.body === 'object') {
    options.body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }

  if (method !== 'GET') {
    await refreshCsrf();
    headers['X-CSRF-Token'] = csrfToken;
  }

  let response;
  try {
    response = await fetch(path, {...options,method,headers,credentials:'same-origin'});
  } catch (error) {
    throw new Error('Network connection failed');
  }

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    throw error;
  }

  return data;
}

async function loadPurchases() {
  // F2: purchases = await api('/api/purchases'); then renderHistory/updateSummary.
  purchases = await api('/api/purchases');
  renderHistory();
  updateSummary();
}

async function showTracker(user) {
  // F3: load categories and populate select using createElement/textContent.
  // Show user email, reveal panel, loadPurchases. Do not display password/hash.
  const categories = await api('/api/categories');
  const categorySelect = byId('category');

  categorySelect.textContent = '';
  for (const category of categories) {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.append(option);
  }

  byId('account-status').textContent = `Signed in as ${user.email}`;
  byId('tracker-panel').hidden = false; // Show purchase tracker panel
  byId('login-panel').hidden = true; // Hide login panel
  await loadPurchases();
}

function resetEdit() {
  editingId=null; form.reset(); saveButton.textContent='Add purchase';
}

function renderHistory() {
  const list=byId('purchase-list'); list.textContent='';
  for(const purchase of purchases){
    const li=document.createElement('li');
    const text=document.createElement('span');
    text.textContent=`${purchase.name} / Quantity: ${purchase.quantity} / Unit price: ${money(purchase.unitPriceCents)} / Cost: ${money(purchase.costCents)} / ${purchase.categoryName} `;
    const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';
    edit.addEventListener('click',()=>beginEdit(purchase));
    const del=document.createElement('button');del.type='button';del.textContent='Delete';
    del.addEventListener('click',()=>deletePurchase(purchase.id));
    li.append(text,edit,del);list.append(li);
  }
}

function updateSummary() {
  // F4: sum costCents from current purchases; display money(total) and length.
let totalCents = 0;
  for (const purchase of purchases) {
    totalCents += purchase.costCents;
  }

  byId('total-invested').textContent = money(totalCents);
  byId('purchase-count').textContent = purchases.length; 
}

function beginEdit(purchase) {
  // F5: fill all four fields; editingId=purchase.id; label button 'Save changes'.
  editingId=purchase.id;
  byId('investment-name').value=purchase.name;
  byId('quantity').value=purchase.quantity;
  byId('unit-price').value=(purchase.unitPriceCents/100).toFixed(2);
  byId('category').value=purchase.categoryId;
  saveButton.textContent='Save changes';
}

async function deletePurchase(id) {
  // F5: DELETE, reset edit if deleting that record, reload list, feedback; catch failures.
  try {
    await api(`/api/purchases/${id}`, { method: 'DELETE' });
    if (editingId === id)
      resetEdit();
    await loadPurchases();
    message.textContent = `Purchase with ID ${id} successfully deleted.`;
  } catch (error) {
    message.textContent = `Failed to delete purchase with ID ${id}: ${error.message}`;
  }
}

form.addEventListener('submit',async(event) => {
  event.preventDefault();
  // F6: validate PA1 input bounds/step before converting dollars to integer cents.
  // Build {name,quantity,unitPriceCents,categoryId}; use Number for numeric fields.
  // Disable saveButton; in try use POST or PUT according to editingId.
  // Reset only after a successful mutation; reload authoritative list and show feedback.
  // In catch preserve failed inputs and show error; finally restore saveButton.
  const name = byId('investment-name').value.trim();
  const quantityInput = byId('quantity');
  const quantity = Number(quantityInput.value);
  const unitPriceInput = byId('unit-price');
  const unitPrice = Number(unitPriceInput.value);
  const categoryId = Number(byId('category').value);

  if (name === "") {
    message.textContent = "Investment name cannot be blank.";
    return;
  }
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 10000) {
    message.textContent = "Quantity must be a whole number between 1 and 10,000.";
    return;
  }
  if (quantityInput.validity.stepMismatch) {
    message.textContent = "Quantity must be a whole number.";
    return;
  }
  if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 1000000) {
    message.textContent = "Unit price must be a number greater than 0 and less than or equal to 1,000,000.";
    return;
  }
  if (unitPriceInput.validity.stepMismatch) {
    message.textContent = "Unit price must be a valid dollar amount with two decimal places max.";
    return;
  }

  const unitPriceCents = Math.round(unitPrice * 100);
  const purchase = { name, quantity, unitPriceCents, categoryId };
  saveButton.disabled = true;

  try {
    if (editingId === null) {
      await api('/api/purchases', { method: 'POST', body: purchase });
      message.textContent = 'Successfully added new purchase.';
    } else {
      await api(`/api/purchases/${editingId}`, { method: 'PUT', body: purchase });
      message.textContent = `Successfully updated purchase with ID ${editingId}.`;
    }
    resetEdit();
    await loadPurchases();
  } catch (error) {
    message.textContent = `Failed to save purchase: ${error.message}`;
  } finally {
    saveButton.disabled = false;
  }
});

byId('cancel-edit').addEventListener('click',resetEdit);

byId('auth-form').addEventListener('submit', async(event) => {
  event.preventDefault();
  // F7: POST login using email/password; refreshCsrf after session regeneration;
  // showTracker; clear password input. Show errors and restore disabled button.
  const loginButton = byId('login-button');
  loginButton.disabled = true;
  try {
    const user = await api('/api/login', { method: 'POST', body: { email: byId('email').value, password: byId('password').value } });
    await refreshCsrf();
    await showTracker(user);
    byId('password').value = '';
    message.textContent = '';
  } catch (error) {
    message.textContent = `Login failed: ${error.message}`;
  } finally {
    loginButton.disabled = false;
  }
});

byId('register-button').addEventListener('click', async() => {
  // F7: POST register; show 'Registration complete. Please log in.'; clear password.
  const registerButton = byId('register-button');
  registerButton.disabled = true;
  try {
    const registerResult = await api('/api/register', { method: 'POST', body: { email: byId('email').value, password: byId('password').value } });
    if (registerResult) {
      message.textContent = 'Registration complete. Please log in.';
      byId('password').value = '';
    }
  } catch (error) {
    message.textContent = `Registration failed: ${error.message}`;
  } finally {
    registerButton.disabled = false;
  }
});

byId('logout-button').addEventListener('click',async() => {
  // F7: POST logout; clear local purchases, form, account label and private UI.
  // csrfToken=null so the next mutation initializes a new session.
  const logoutButton = byId('logout-button');
  logoutButton.disabled = true;
  try {
    await api('/api/logout', { method: 'POST' });
    csrfToken = null;
    purchases = [];
    resetEdit();
    byId('auth-form').reset();
    byId('account-status').textContent = '';
    byId('tracker-panel').hidden = true; // Hide purchase tracker panel
    byId('login-panel').hidden = false; // Show login panel
  } catch (error) {
    message.textContent = `Logout failed: ${error.message}`;
  } finally {
    logoutButton.disabled = false;
  }
});

async function initialize() {
  // F7: GET /api/me; showTracker when logged in; handle 401 as signed out.
  // Do not show an alarming error merely because a new visitor is not logged in.
  try {
    const me = await api('/api/me');
    await showTracker(me);
  } catch (error) {
    if (error.status !== 401) {
      message.textContent = `Failed to load account: ${error.message}`;
    }
  }
}
initialize();
