async function run(input = {}) {
  const timezone = input.timezone || process.env.TZ || "Asia/Shanghai";
  const now = new Date();

  return {
    timezone,
    iso: now.toISOString(),
    local: new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "full",
      timeStyle: "long",
      timeZone: timezone,
    }).format(now),
  };
}

module.exports = {
  run,
};
