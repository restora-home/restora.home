(function(){
  var ctas = [].slice.call(document.querySelectorAll('.cta, .pill-dark'));
  var backdrop = document.getElementById('modalBackdrop');
  var modal = document.getElementById('leadModal');
  var closeBtn = document.getElementById('modalClose');
  var form = document.getElementById('leadForm');
  var statusEl = document.getElementById('modalStatus');
  var eyebrowEl = document.getElementById('modalEyebrow');
  var titleEl = document.getElementById('modalTitle');
  var topicInput = document.getElementById('modalTopic');
  var submitBtn = document.getElementById('modalSubmit');

  function openModal(cta){
    var topic = cta.getAttribute('data-topic') || 'Заявка с сайта';
    var label = cta.textContent.trim();
    eyebrowEl.textContent = topic;
    titleEl.textContent = label;
    form.reset();
    topicInput.value = topic;
    statusEl.textContent = '';
    statusEl.className = 'modal-status';
    window.__modalOpen = true;
    backdrop.classList.add('on'); modal.classList.add('on');
    setTimeout(function(){ var n=form.querySelector('input[name="name"]'); if(n) n.focus(); }, 300);
  }
  function closeModal(){
    backdrop.classList.remove('on'); modal.classList.remove('on');
    window.__modalOpen = false;
  }
  ctas.forEach(function(a){ a.addEventListener('click', function(e){ e.preventDefault(); openModal(a); }); });
  backdrop.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modal.classList.contains('on')) closeModal(); });

  function showStatus(text, isError, isOk){
    statusEl.textContent = text;
    statusEl.className = 'modal-status' + (isError?' err':'') + (isOk?' ok':'');
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var data = {
      name: (form.name.value||'').trim(),
      phone: (form.phone.value||'').trim(),
      message: (form.message.value||'').trim(),
      topic: topicInput.value
    };
    if(!data.name){ showStatus('Укажите имя', true); form.name.focus(); return; }
    var digits = data.phone.replace(/\D/g,'');
    if(digits.length < 10){ showStatus('Проверьте номер телефона', true); form.phone.focus(); return; }

    submitBtn.disabled = true;
    showStatus('Отправляем…', false);
    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(json){
        if(!res.ok) throw new Error(json.error || 'Ошибка отправки');
        showStatus('Заявка отправлена. Скоро свяжемся!', false, true);
        submitBtn.disabled = false;
        setTimeout(closeModal, 1800);
      });
    }).catch(function(err){
      showStatus(err.message || 'Не получилось отправить, попробуйте ещё раз', true);
      submitBtn.disabled = false;
    });
  });
})();
