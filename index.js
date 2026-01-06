const axios = require("axios");

const UPI_ID = "8121893882-2@ybl";
let sessions = {};

module.exports = async (req, res) => {
  const data = req.body.data || {};
  const from = data.from;
  const name = data.notifyName || "";
  const buttonId = data.button?.payload; // button reply
  const text = (data.body || "").trim();
  const type = data.type;

  if (!from) return res.sendStatus(200);

  if (!sessions[from]) {
    sessions[from] = { step: "MENU", phone: from, name };
  }

  const s = sessions[from];

  // BACK
  if (buttonId === "BACK") {
    s.step = "MENU";
  }

  switch (s.step) {

    // ---------------- MENU ----------------
    case "MENU":
      await sendButtons(from,
        "🥛 *Welcome to Bala Milk Dairy*\n\nPlease choose an option:",
        [
          { id: "BUFFALO", title: "Buffalo Milk" },
          { id: "COW", title: "Cow Milk" },
          { id: "PANEER", title: "Paneer" },
          { id: "GHEE", title: "Ghee" },
          { id: "ENQUIRY", title: "Enquiry Only" }
        ]
      );
      s.step = "PRODUCT";
      break;

    // ---------------- PRODUCT ----------------
    case "PRODUCT":
      if (buttonId === "ENQUIRY") {
        s.type = "Enquiry";
        s.step = "ENQUIRY";
        await sendText(from, "✍️ Please type your enquiry.");
        break;
      }

      const products = {
        BUFFALO: { name: "Buffalo Milk", price: 100 },
        COW: { name: "Cow Milk", price: 120 },
        PANEER: { name: "Paneer", price: 600 },
        GHEE: { name: "Ghee", price: 1000 }
      };

      if (!products[buttonId]) break;

      s.product = products[buttonId];

      await sendButtons(from,
        `🧾 *${s.product.name}*\nChoose quantity:`,
        [
          { id: "Q_500", title: `500ml – ₹${s.product.price / 2}` },
          { id: "Q_1L", title: `1 L – ₹${s.product.price}` },
          { id: "Q_2L", title: `2 L – ₹${s.product.price * 2}` },
          { id: "BACK", title: "⬅ Back" }
        ]
      );
      s.step = "QUANTITY";
      break;

    // ---------------- QUANTITY ----------------
    case "QUANTITY":
      const qtyMap = {
        Q_500: { q: "500ml", m: 0.5 },
        Q_1L: { q: "1L", m: 1 },
        Q_2L: { q: "2L", m: 2 }
      };

      if (!qtyMap[buttonId]) break;

      s.quantity = qtyMap[buttonId].q;
      s.price = s.product.price * qtyMap[buttonId].m;

      await sendButtons(from,
        "📍 Delivery Address:",
        [
          { id: "LOC", title: "Send Live Location" },
          { id: "ADDR", title: "Type Address" },
          { id: "BACK", title: "⬅ Back" }
        ]
      );
      s.step = "ADDRESS";
      break;

    // ---------------- ADDRESS ----------------
    case "ADDRESS":
      if (buttonId === "LOC") {
        s.step = "LOCATION";
        await sendText(from, "📌 Please share live location.");
      } 
      else if (buttonId === "ADDR") {
        s.step = "ADDRESS_TEXT";
        await sendText(from, "✍️ Please type your full address.");
      }
      break;

    case "LOCATION":
      if (type !== "location") break;
      s.address = "Live Location";
      s.step = "DELIVERY";
      await sendButtons(from,
        "⏰ Delivery Slot:",
        [
          { id: "MORNING", title: "Morning" },
          { id: "EVENING", title: "Evening" }
        ]
      );
      break;

    case "ADDRESS_TEXT":
      s.address = text;
      s.step = "DELIVERY";
      await sendButtons(from,
        "⏰ Delivery Slot:",
        [
          { id: "MORNING", title: "Morning" },
          { id: "EVENING", title: "Evening" }
        ]
      );
      break;

    // ---------------- DELIVERY ----------------
    case "DELIVERY":
      s.delivery = buttonId;
      s.step = "TIME";
      await sendText(from, "🕒 Enter delivery time (example: 6:30 AM)");
      break;

    case "TIME":
      s.deliveryTime = text;
      s.step = "PAYMENT";
      await sendButtons(from,
        "💰 Payment Method:",
        [
          { id: "UPI", title: "UPI" },
          { id: "COD", title: "Cash on Delivery" }
        ]
      );
      break;

    // ---------------- PAYMENT ----------------
    case "PAYMENT":
      if (buttonId === "COD") {
        await sendText(from,
`✅ Order Confirmed!

🙏 Thank you for ordering from *Bala Milk Dairy* 🥛`);
        delete sessions[from];
      }

      if (buttonId === "UPI") {
        s.step = "SCREENSHOT";
        await sendText(from,
`💳 Pay via UPI:
👉 ${UPI_ID}

📸 Send payment screenshot`);
      }
      break;

    // ---------------- SCREENSHOT ----------------
    case "SCREENSHOT":
      if (type !== "image") break;

      await sendText(from,
`✅ Payment received!

🙏 Thank you for ordering from *Bala Milk Dairy* 🥛`);
      delete sessions[from];
      break;

    // ---------------- ENQUIRY ----------------
    case "ENQUIRY":
      await sendText(from,
`🙏 Thank you for contacting *Bala Milk Dairy*.
We will get back to you soon.`);
      delete sessions[from];
      break;
  }

  res.sendStatus(200);
};

// ---------------- SEND TEXT ----------------
async function sendText(to, body) {
  await axios.post(process.env.WHATSAPP_API_URL, {
    to,
    body
  });
}

// ---------------- SEND BUTTONS ----------------
async function sendButtons(to, text, buttons) {
  await axios.post(process.env.WHATSAPP_API_URL, {
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: buttons.map(b => ({
          type: "reply",
          reply: { id: b.id, title: b.title }
        }))
      }
    }
  });
}
