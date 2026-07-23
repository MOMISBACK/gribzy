const button = document.querySelector('#language');
const translatable = document.querySelectorAll('[data-en][data-fr]');

function applyLanguage(language) {
  document.documentElement.lang = language;
  translatable.forEach((element) => {
    const value = element.dataset[language];
    if (element.hasAttribute('data-lines')) {
      const lines = value.split('|');
      element.replaceChildren();
      lines.forEach((line, index) => {
        if (index > 0) element.append(document.createElement('br'));
        element.append(document.createTextNode(line));
      });
      return;
    }
    element.textContent = value;
  });
  button.textContent = language === 'en' ? 'FR' : 'EN';
  button.setAttribute('aria-label', language === 'en' ? 'Afficher le site en français' : 'Display the site in English');
  localStorage.setItem('gribzy-site-language', language);
}

const stored = localStorage.getItem('gribzy-site-language');
const detected = navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
applyLanguage(stored === 'fr' || stored === 'en' ? stored : detected);
button.addEventListener('click', () => applyLanguage(document.documentElement.lang === 'en' ? 'fr' : 'en'));
