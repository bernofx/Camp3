(function () {
  const environments = {
    test: {
      label: "TEST",
      spreadsheetId: "1-9EeieQQrgSHsV83W124Y__qtTnrwS9B_reX6DnqZ0s",
      editUrl: "https://docs.google.com/spreadsheets/d/1-9EeieQQrgSHsV83W124Y__qtTnrwS9B_reX6DnqZ0s/edit",
      tabs: { U13: 802213441, U14: 381131148, U15: 276050103, U17: 0 },
      noticesGid: 1394669895
    },
    prod: {
      label: "PROD",
      spreadsheetId: "1KzqZ6l0MuIIqO3Z812aDAYxcYnw8Um4AJuoDQy-8YE8",
      editUrl: "https://docs.google.com/spreadsheets/d/1KzqZ6l0MuIIqO3Z812aDAYxcYnw8Um4AJuoDQy-8YE8/edit",
      tabs: { U13: 802213441, U14: 381131148, U15: 276050103, U17: 0 },
      noticesGid: null
    }
  };

  const requested = new URLSearchParams(window.location.search).get("env");
  const activeName = requested === "prod" ? "prod" : "test";
  window.VOLLEYSTARS_CONFIG = { activeName, ...environments[activeName] };
})();
