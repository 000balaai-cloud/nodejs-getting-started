const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const WHATSAPP_API = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

let sessions = {};

/* -------------------- WEBHOOK VERIFY -------------------- */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* -------------------- WEBHOOK RECEIVE -------------------- */
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body;
    const buttonId = message.button?.payload;

    console.log("Incoming:", text || buttonId);

    if (!sessions[from]) {
      sessions[from] = { step: "MENU" };
      await sendMenu(from);
      return res.sendStatus(200);
    }

    const s = sessions[from];

    /* -------- BACK -------- */
    if (buttonId === "BACK") {
      s.step = "MENU";
      await sendMenu(from);
      return res.sendStatus(200);
    }

    /* -------- FLOW -------- */
    switch (s.step) {
      case "MENU":
        if (buttonId === "BUFFALO") {
          s.product = "Buffalo Milk";
          s.price = 100;
        } else if (buttonId === "COW") {
          s.product = "Cow Milk";
          s.price = 120;
        } else {
          await sendMenu(from);
          return res.sendStatus(200);
        }

        s.step = "QTY";
        await sendQuantity(from, s);
        break;

      case "QTY":
        if (buttonId === "Q500") {
          s.qty = "500 ml";
          s.total = s.price / 2;
        } else if (buttonId === "Q1") {
          s.qty = "1 L";
          s.total = s.price;
        } else if (buttonId === "Q2") {
          s.qty = "2 L";
          s.total = s.price * 2;
        } else {
          await sendQuantity(from, s);
          return res.sendStatus(200);
        }

        s.step = "CONFIRM";
        await sendConfirm(from, s);
        break;

      case "CONFIRM":
        await sendText(
          from,
          `✅ *Order received*\n\n🍼 ${s.product}\n📦 ${s.qty}\n💰 ₹${s.total}\n\n🙏 Our team will contact you shortly.`
        );
        delete sessions[from];
        break;
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook Error:", err.response?.data || err.message);
    res.sendStatus(200);
  }
});

/* -------------------- SENDERS -------------------- */

async function sendMenu(to) {
  await sendButtons(to, "🥛 *Bala Milk Dairy*\nSelect product:", [
    { id: "BUFFALO", title: "Buffalo Milk ₹100/L" },
    { id: "COW", title: "Cow Milk ₹120/L" },
  ]);
}

async function sendQuantity(to, s) {
  await sendButtons(
    to,
    `🧾 *${s.product}*\nSelect quantity:`,
    [
      { id: "Q500", title: "500 ml" },
      { id: "Q1", title: "1 L" },
      { id: "Q2", title: "2 L" },
      { id: "BACK", title: "⬅ Back" },
    ]
  );
}

async function sendConfirm(to, s) {
  await sendText(
    to,
    `🧾 *Order Summary*\n\n🍼 ${s.product}\n📦 ${s.qty}\n💰 ₹${s.total}\n\nReply anything to confirm`
  );
}

async function sendText(to, text) {
  await axios.post(
    WHATSAPP_API,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

async function sendButtons(to, body, buttons) {
  await axios.post(
    WHATSAPP_API,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

/* -------------------- START SERVER -------------------- */
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
