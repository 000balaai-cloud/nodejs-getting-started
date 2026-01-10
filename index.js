const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const API_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

const sessions = {};

/* ================= VERIFY ================= */
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    console.log("✅ Webhook verified");
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

/* ================= RECEIVE ================= */
app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const text = msg.text?.body?.toLowerCase();
    const replyId = msg.interactive?.list_reply?.id || msg.interactive?.button_reply?.id;

    console.log("📩 Incoming:", text || replyId);

    if (!sessions[from]) {
      sessions[from] = { step: "MENU" };
      await sendMainMenu(from);
      return res.sendStatus(200);
    }

    const s = sessions[from];

    /* BACK */
    if (replyId === "BACK") {
      s.step = "MENU";
      await sendMainMenu(from);
      return res.sendStatus(200);
    }

    switch (s.step) {
      /* -------- MENU -------- */
      case "MENU":
        handleProduct(replyId, s);
        if (!s.product) {
          await sendMainMenu(from);
          break;
        }
        s.step = "QTY";
        await sendQuantity(from, s);
        break;

      /* -------- QTY -------- */
      case "QTY":
        handleQty(replyId, s);
        if (!s.qty) {
          await sendQuantity(from, s);
          break;
        }
        s.step = "CONFIRM";
        await sendConfirm(from, s);
        break;

      /* -------- CONFIRM -------- */
      case "CONFIRM":
        await sendText(
          from,
          `✅ *Order Confirmed!*\n\n🛒 ${s.product}\n📦 ${s.qty}\n💰 ₹${s.total}\n\n🙏 Thank you for ordering from *Bala Milk Store* 🥛`
        );
        delete sessions[from];
        break;
    }

    res.sendStatus(200);
  } catch (e) {
    console.error("❌ Error:", e.response?.data || e.message);
    res.sendStatus(200);
  }
});

/* ================= LOGIC ================= */

function handleProduct(id, s) {
  const map = {
    BUFFALO: { name: "Buffalo Milk", price: 100 },
    COW: { name: "Cow Milk", price: 120 },
    PANEER: { name: "Paneer", price: 600 },
    GHEE: { name: "Ghee", price: 1000 },
    SUBS: { name: "Daily Milk Subscription", price: 0 },
    OWNER: { name: "Talk to Owner", price: 0 },
  };
  if (map[id]) {
    s.product = map[id].name;
    s.price = map[id].price;
  }
}

function handleQty(id, s) {
  const q = {
    Q500: { q: "500 ml", m: 0.5 },
    Q1: { q: "1 L", m: 1 },
    Q2: { q: "2 L", m: 2 },
  };
  if (!q[id]) return;
  s.qty = q[id].q;
  s.total = s.price * q[id].m;
}

/* ================= SENDERS ================= */

async function sendMainMenu(to) {
  await axios.post(
    API_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: "🥛 *Welcome to Bala Milk Store*\n\nPlease choose an option:" },
        action: {
          button: "View Menu",
          sections: [
            {
              title: "Milk Products",
              rows: [
                { id: "BUFFALO", title: "Buffalo Milk", description: "₹100 / L" },
                { id: "COW", title: "Cow Milk", description: "₹120 / L" },
                { id: "PANEER", title: "Paneer", description: "₹600 / Kg" },
                { id: "GHEE", title: "Ghee", description: "₹1000 / Kg" },
                { id: "SUBS", title: "Daily Milk Subscription" },
                { id: "OWNER", title: "Talk to Owner" },
              ],
            },
          ],
        },
      },
    },
    auth()
  );
}

async function sendQuantity(to, s) {
  await sendButtons(to, `🧾 *${s.product}*\nChoose quantity:`, [
    { id: "Q500", title: "500 ml" },
    { id: "Q1", title: "1 L" },
    { id: "Q2", title: "2 L" },
  ]);
}

async function sendConfirm(to, s) {
  await sendButtons(
    to,
    `🧾 *Confirm Order*\n\n${s.product}\n${s.qty}\n₹${s.total}`,
    [{ id: "CONFIRM", title: "Confirm ✅" }, { id: "BACK", title: "⬅ Back" }]
  );
}

async function sendButtons(to, body, buttons) {
  await axios.post(
    API_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.map(b => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    },
    auth()
  );
}

async function sendText(to, body) {
  await axios.post(
    API_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    },
    auth()
  );
}

function auth() {
  return {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
  };
}

/* ================= START ================= */
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
