(() => {
  const storageKey = "foxfire-design-look";
  const looks = {
    ledger: "#e9e6dd",
    journal: "#f4e8d9",
    signal: "#f7f8f6"
  };
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll("[data-look-choice]")];

  function applyLook(look) {
    const selectedLook = Object.prototype.hasOwnProperty.call(looks, look) ? look : "ledger";
    document.body.dataset.look = selectedLook;
    root.querySelector('meta[name="theme-color"]').content = looks[selectedLook];
    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.lookChoice === selectedLook));
    });
  }

  applyLook(localStorage.getItem(storageKey));

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const look = button.dataset.lookChoice;
      localStorage.setItem(storageKey, look);
      applyLook(look);
    });
  });
})();
