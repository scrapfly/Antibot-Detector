/** Standalone code templates for this vendor. */
CloudflareAdvanced.prototype.generateCloudflareParsingCode = function(urls, language) {
        const templates = {
            'JavaScript': () => `// Cloudflare Challenge Scripts
const cloudflareScripts = ${JSON.stringify(urls, null, 2)};

cloudflareScripts.forEach((url, index) => {
    console.log(\`Script \${index + 1}: \${url}\`);
});

// Fetch challenge scripts
async function fetchCloudflareScripts() {
    for (const url of cloudflareScripts) {
        try {
            const response = await fetch(url);
            const script = await response.text();
            console.log(\`Fetched: \${url}\`);
        } catch (error) {
            console.error(\`Failed to fetch: \${url}\`, error);
        }
    }
}

fetchCloudflareScripts();`,

            'Python': () => `import requests

# Cloudflare Challenge Scripts
cloudflare_scripts = ${JSON.stringify(urls, null, 2)}

for index, url in enumerate(cloudflare_scripts, 1):
    print(f'Script {index}: {url}')

def fetch_cloudflare_scripts():
    for url in cloudflare_scripts:
        try:
            response = requests.get(url)
            print(f'Fetched: {url}')
        except Exception as e:
            print(f'Failed to fetch: {url}', e)

fetch_cloudflare_scripts()`,

            'Node.js': () => `const axios = require('axios');

// Cloudflare Challenge Scripts
const cloudflareScripts = ${JSON.stringify(urls, null, 2)};

cloudflareScripts.forEach((url, index) => {
    console.log(\`Script \${index + 1}: \${url}\`);
});

async function fetchCloudflareScripts() {
    for (const url of cloudflareScripts) {
        try {
            const response = await axios.get(url);
            console.log(\`Fetched: \${url}\`);
        } catch (error) {
            console.error(\`Failed to fetch: \${url}\`, error.message);
        }
    }
}

fetchCloudflareScripts();`,

            'PHP': () => `<?php
// Cloudflare Challenge Scripts
$cloudflareScripts = ${JSON.stringify(urls, null, 2)};

foreach ($cloudflareScripts as $index => $url) {
    echo "Script " . ($index + 1) . ": " . $url . PHP_EOL;
}

function fetchCloudflareScripts() {
    global $cloudflareScripts;

    foreach ($cloudflareScripts as $url) {
        try {
            $response = file_get_contents($url);
            echo "Fetched: " . $url . PHP_EOL;
        } catch (Exception $e) {
            echo "Failed to fetch: " . $url . PHP_EOL;
        }
    }
}

fetchCloudflareScripts();
?>`,

            'C#': () => {
                const scriptLines = urls.map(u => `        "${u}"`).join(',\n');
                return `using System;
using System.Net.Http;
using System.Collections.Generic;
using System.Threading.Tasks;

class CloudflareScripts
{
    private static readonly string[] Scripts = new string[]
    {
${scriptLines}
    };

    static void Main()
    {
        FetchCloudflareScriptsAsync().Wait();
    }

    static async Task FetchCloudflareScriptsAsync()
    {
        using (HttpClient client = new HttpClient())
        {
            for (int i = 0; i < Scripts.Length; i++)
            {
                try
                {
                    HttpResponseMessage response = await client.GetAsync(Scripts[i]);
                    Console.WriteLine($"Fetched: {Scripts[i]}");
                }
                catch (Exception e)
                {
                    Console.WriteLine($"Failed to fetch: {Scripts[i]} - {e.Message}");
                }
            }
        }
    }
}`;
            },

            'Go': () => {
                const scriptLines = urls.map(u => `	"${u}"`).join(',\n');
                return `package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
)

var cloudflareScripts = []string{
${scriptLines}
}

func main() {
	fetchCloudflareScripts()
}

func fetchCloudflareScripts() {
	client := &http.Client{}

	for _, url := range cloudflareScripts {
		resp, err := client.Get(url)
		if err != nil {
			fmt.Printf("Failed to fetch: %s - %v\\n", url, err)
			continue
		}

		body, _ := ioutil.ReadAll(resp.Body)
		resp.Body.Close()

		fmt.Printf("Fetched: %s\\n", url)
		_ = body
	}
}`;
            }
        };

        return templates[language] ? templates[language]() : this._txt('advCommonCodeGenUnavailable', 'Code generation not available');
    };