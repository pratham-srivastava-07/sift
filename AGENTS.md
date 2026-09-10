## Product Requirement

Build a scraping engine to extract content from a given website based on a user prompts of fields they want to pull out.

Keep in mind:
How you would extract the raw html
How you would make it token effecient
How you would use AI to extract the information

Constraints:
You can use browser engines like Puppteer but no AI scraping services or projects like Crawl4AI


Example link
 to scrape: 
https://www.amazon.com/Charger-Dot-Matrix-Display-Charging-MacBook/dp/B0F9PKSJ17?sr=8-4


{
    peice: "",
    description: "",
    title: ""
}

there will be a user prompt like: Give me the price of product XYZ from abc website

The output depends upon what user has asked for:

{
    price: ""
}

Refer: architecture.md and boundaries.md to keep in mind about how to take decisions while writing the code 