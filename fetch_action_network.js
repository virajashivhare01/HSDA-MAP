import fs from 'fs/promises';
import fetch from 'node-fetch';

const apiKey = process.env.API_KEY; // Replace with your API key or use environment variables
const formId = process.env.FORM_ID; // Replace with your form ID or use environment variables

const latestSubmissionByPersonLink = {};
let reportData = [];

async function logToFile(filename, data) {
  await fs.appendFile(filename, `${data}\n`, "utf8");
}

async function main() {
  console.log("Fetching and processing Action Network data...");

  await fetchAllPages();
  await fetchAllPersonDetails();

  await fs.writeFile("data.json", JSON.stringify(reportData, null, 2), "utf8");
  console.log("Data successfully saved to data.json!");
}

async function fetchAllPages() {
  const queue = [`https://actionnetwork.org/api/v2/forms/${formId}/submissions/`];
  const workers = [];

  return new Promise((resolve) => {
    async function worker() {
      while (queue.length > 0) {
        const url = queue.shift();
        try {
          await fetchOnePage(url, queue);
        } catch (error) {
          await logToFile("debug.log", `Error fetching page: ${url} - ${error}`);
        }
      }
    }

    for (let i = 0; i < 5; i++) {
      workers.push(worker());
    }

    Promise.all(workers).then(resolve);
  });
}

async function fetchOnePage(url, queue) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", "OSDI-API-Token": apiKey },
  });

  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

  const data = await response.json();
  await logToFile("debug.log", `Fetched page data: ${JSON.stringify(data)}`);
  const submissions = data._embedded?.["osdi:submissions"] || [];
  processSubmissions(submissions);

  const nextPage = data._links?.next?.href;
  if (nextPage) queue.push(nextPage);
}

function processSubmissions(submissions) {
  for (const submission of submissions) {
    const personLink = submission._links?.["osdi:person"]?.href || "N/A";
    const createdAt = submission.created_date || "";

    const existing = latestSubmissionByPersonLink[personLink];
    if (!existing || new Date(createdAt) > new Date(existing.submissionDate)) {
      latestSubmissionByPersonLink[personLink] = {
        ...submission,
        submissionDate: createdAt,
      };
    }
  }
}

async function fetchAllPersonDetails() {
  const finalSubs = Object.entries(latestSubmissionByPersonLink).map(([personLink, submission]) => ({
    personLink,
    submission,
  }));

  const workers = [];
  let index = 0;

  return new Promise((resolve) => {
    async function worker() {
      while (index < finalSubs.length) {
        const currentIndex = index++;
        if (currentIndex >= finalSubs.length) break;

        const { personLink, submission } = finalSubs[currentIndex];
        let person = null;

        if (personLink !== "N/A") {
          try {
            person = await fetchPersonDetails(personLink);
            await logToFile("debug.log", `Fetched person details: ${JSON.stringify(person)}`);
          } catch (error) {
            await logToFile("debug.log", `Error fetching person details for: ${personLink} - ${error}`);
          }
        }

        const filteredData = filterData(person, submission);
        reportData.push(filteredData);
      }
    }

    for (let i = 0; i < 5; i++) {
      workers.push(worker());
    }

    Promise.all(workers).then(resolve);
  });
}

async function fetchPersonDetails(url) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", "OSDI-API-Token": apiKey },
  });

  if (!response.ok) throw new Error(`HTTP error fetching person! Status: ${response.status}`);
  return response.json();
}

function filterData(person, submission) {
  return {
    "Zip code": person?.postal_addresses?.[0]?.postal_code || "N/A",
    "City": person?.postal_addresses?.[0]?.locality || "N/A",
    "ChapterLeaderName": person?.custom_fields?.ChapterLeaderName || "N/A",
    "ChapterName": person?.custom_fields?.ChapterName || "N/A",
    "Timestamp (EST)": submission?.created_date || "N/A",
  };
}

main().catch((err) => {
  console.error("Error in main():", err);
  process.exit(1);
});
