
const BASE_URL = "http://localhost:3000";

async function runTests() {
  console.log("=== TEST 1: ROUND ROBIN ===");

  const counts = {};

  // Mengirim 9 request untuk melihat distribusi
  for (let i = 1; i <= 9; i++) {
    try {
      const response = await fetch(`${BASE_URL}/menu`);
      const data = await response.json();

      console.log(
        `Request ${i}: HTTP ${response.status} - ${data.server}`
      );

      if (response.ok) {
        counts[data.server] = (counts[data.server] || 0) + 1;
      }
    } catch (error) {
      console.log(`Request ${i} gagal: ${error.message}`);
    }
  }

  console.log("\nDistribusi request:");
  console.log(counts);

  console.log("\n=== TEST 2: PEMESANAN MAKANAN ===");

  try {
    const response = await fetch(`${BASE_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        menuId: 1,
        quantity: 2
      })
    });

    const data = await response.json();

    console.log("HTTP Status:", response.status);
    console.log(JSON.stringify(data, null, 2));

    if (response.status === 201) {
      console.log("Pemesanan berhasil.");
    } else {
      console.log("Pemesanan gagal.");
    }
  } catch (error) {
    console.log(`Request pemesanan gagal: ${error.message}`);
  }

  console.log("\n=== TEST 3: VALIDASI PESANAN ===");

  try {
    const response = await fetch(`${BASE_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        menuId: 999,
        quantity: 1
      })
    });

    const data = await response.json();

    console.log("HTTP Status:", response.status);
    console.log("Respons:", data);
    console.log(
      response.status === 400
        ? "Validasi berhasil."
        : "Periksa kembali validasi."
    );
  } catch (error) {
    console.log(`Request validasi gagal: ${error.message}`);
  }

  console.log("\n=== TEST 4: REGISTRASI BACKEND DINAMIS ===");

  try {
    const registerResponse = await fetch(`${BASE_URL}/servers/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        host: "localhost",
        port: 3999,
        name: "Dynamic Server",
        weight: 1
      })
    });
    const registerData = await registerResponse.json();

    const listResponse = await fetch(`${BASE_URL}/servers`);
    const listData = await listResponse.json();
    const dynamicServer = listData.servers.find(
      (server) => server.port === 3999
    );

    console.log("Registrasi:", registerData);
    console.log("Backend ditemukan:", Boolean(dynamicServer));

    await fetch(`${BASE_URL}/servers/3999`, {
      method: "DELETE"
    });
  } catch (error) {
    console.log(`Pengujian registrasi dinamis gagal: ${error.message}`);
  }
}

runTests();
