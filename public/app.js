(function () {
  'use strict';

  const form = document.getElementById('form');
  const input = document.getElementById('url');
  const go = document.getElementById('go');
  const shortenBox = document.getElementById('shorten');
  const problem = document.getElementById('problem');
  const tally = document.getElementById('tally');

  const report = document.getElementById('report');
  const reportNote = document.getElementById('report-note');
  const base = document.getElementById('base');
  const params = document.getElementById('params');

  const output = document.getElementById('output');
  const cleanedOut = document.getElementById('cleaned');
  const shortBlock = document.getElementById('short-block');
  const shortOut = document.getElementById('short');

  const nf = new Intl.NumberFormat();

  // ------------------------------------------------------------- counter

  function setTally(n) {
    tally.textContent = nf.format(n);
  }

  fetch('/api/stats')
    .then((r) => r.json())
    .then((d) => setTally(d.cleaned))
    .catch(() => {
      tally.textContent = 'plenty of';
    });

  // ------------------------------------------------------------- rendering

  function row(sep, key, value, note, kind, index) {
    const li = document.createElement('li');
    li.className = kind;
    li.style.setProperty('--i', String(index));

    const s = document.createElement('span');
    s.className = 'sep';
    s.textContent = sep;

    const pair = document.createElement('span');
    pair.className = 'pair';
    const k = document.createElement('span');
    k.className = 'k';
    k.textContent = key;
    const v = document.createElement('span');
    v.className = 'v';
    v.textContent = value;
    pair.append(k, document.createTextNode('='), v);

    const n = document.createElement('span');
    n.className = 'note';
    n.textContent = note;

    li.append(s, pair, n);
    return li;
  }

  function drawReport(data) {
    let stem = data.cleaned;
    try {
      const u = new URL(data.cleaned);
      stem = u.origin + u.pathname;
    } catch (e) {
      /* fall back to the whole string */
    }
    base.textContent = stem;

    params.classList.remove('animate');
    params.replaceChildren();

    let i = 0;
    for (const p of data.kept) {
      params.append(row(i === 0 ? '?' : '&', p.key, p.value, 'kept', 'held', i));
      i++;
    }
    for (const p of data.removed) {
      params.append(row(i === 0 ? '?' : '&', p.key, p.value, p.reason, 'cut', i));
      i++;
    }

    if (i === 0) {
      const p = document.createElement('p');
      p.className = 'nothing-cut';
      p.textContent = 'That link had no query string at all. Nothing to take off.';
      params.replaceChildren(p);
    }

    // Restarting the animation needs the class off for one frame.
    requestAnimationFrame(() => params.classList.add('animate'));

    const cut = data.removed.length;
    if (cut === 0) {
      reportNote.textContent = 'Nothing on this link was tracking you.';
    } else {
      reportNote.textContent =
        cut === 1 ? 'One parameter removed.' : cut + ' parameters removed.';
    }
  }

  function showProblem(message) {
    problem.textContent = message;
    problem.hidden = false;
  }

  function clearProblem() {
    problem.hidden = true;
    problem.textContent = '';
  }

  // ------------------------------------------------------------- submit

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearProblem();

    const url = input.value.trim();
    if (!url) {
      showProblem('Paste a link first.');
      input.focus();
      return;
    }

    go.disabled = true;
    const label = go.textContent;
    go.textContent = 'Cleaning';

    try {
      const res = await fetch('/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, shorten: shortenBox.checked })
      });
      const data = await res.json();

      if (!data.ok) {
        showProblem(data.error || 'That link could not be cleaned.');
        return;
      }

      setTally(data.total);
      drawReport(data);

      cleanedOut.textContent = data.cleaned;
      if (data.short) {
        shortOut.textContent = data.short;
        shortBlock.hidden = false;
      } else {
        shortBlock.hidden = true;
      }
      output.hidden = false;

      report.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'start'
      });
    } catch (err) {
      showProblem('The server did not answer. Try again in a moment.');
    } finally {
      go.disabled = false;
      go.textContent = label;
    }
  });

  // ------------------------------------------------------------- copying

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('button.copy');
    if (!button) return;

    const target = document.getElementById(button.dataset.copy);
    const text = target ? target.textContent : '';
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.append(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
    }

    const was = button.textContent;
    button.textContent = 'Copied';
    button.dataset.done = 'yes';
    setTimeout(() => {
      button.textContent = was;
      delete button.dataset.done;
    }, 1600);
  });

  // Paste and go: most people arrive with a link already on the clipboard.
  input.addEventListener('paste', () => {
    setTimeout(() => {
      if (input.value.trim()) form.requestSubmit();
    }, 0);
  });
})();
