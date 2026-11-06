const destinations = [
  { name: "New York, United States", aliases: ["new york", "new york city", "nyc", "ny"] },
  { name: "Los Angeles, United States", aliases: ["los angeles", "la", "lax"] },
  { name: "San Francisco, United States", aliases: ["san francisco", "sf", "sfo"] },
  { name: "Chicago, United States", aliases: ["chicago", "chi"] },
  { name: "Boston, United States", aliases: ["boston", "bos"] },
  { name: "Miami, United States", aliases: ["miami"] },
  { name: "Las Vegas, United States", aliases: ["las vegas", "vegas"] },
  { name: "Washington, DC, United States", aliases: ["washington dc", "dc"] },
  { name: "London, United Kingdom", aliases: ["london", "ldn"] },
  { name: "Paris, France", aliases: ["paris"] },
  { name: "Barcelona, Spain", aliases: ["barcelona", "bcn"] },
  { name: "Lisbon, Portugal", aliases: ["lisbon", "lisboa"] },
  { name: "Amsterdam, Netherlands", aliases: ["amsterdam"] },
  { name: "Berlin, Germany", aliases: ["berlin"] },
  { name: "Rome, Italy", aliases: ["rome", "roma"] },
  { name: "Tokyo, Japan", aliases: ["tokyo"] },
  { name: "Bangkok, Thailand", aliases: ["bangkok", "bkk"] },
  { name: "Bali, Indonesia", aliases: ["bali"] },
  { name: "Singapore", aliases: ["singapore", "sg"] },
  { name: "Dubai, United Arab Emirates", aliases: ["dubai", "dxb"] },
  { name: "Mumbai, India", aliases: ["mumbai", "bombay", "bom"] },
  { name: "Goa, India", aliases: ["goa"] },
  { name: "New Delhi, India", aliases: ["new delhi", "delhi"] },
  { name: "Nairobi, Kenya", aliases: ["nairobi", "nbo"] },
  { name: "Cape Town, South Africa", aliases: ["cape town", "cpt"] },
  { name: "Lagos, Nigeria", aliases: ["lagos"] },
  { name: "Sydney, Australia", aliases: ["sydney", "syd"] },
  { name: "Toronto, Canada", aliases: ["toronto", "yyz"] },
] as const;

const countries = [
  { name: "India", aliases: ["india"] },
  { name: "Kenya", aliases: ["kenya"] },
  { name: "Japan", aliases: ["japan"] },
  { name: "Indonesia", aliases: ["indonesia"] },
  { name: "Thailand", aliases: ["thailand"] },
  { name: "United Kingdom", aliases: ["united kingdom", "uk"] },
  { name: "United States", aliases: ["united states", "usa"] },
  { name: "France", aliases: ["france"] },
  { name: "Spain", aliases: ["spain"] },
  { name: "Italy", aliases: ["italy"] },
  { name: "Australia", aliases: ["australia"] },
  { name: "Canada", aliases: ["canada"] },
] as const;

/** An editable text suggestion, not geocoding: never guess between multiple destinations. */
export function suggestTripLocation(name: string): string | undefined {
  const words = ` ${name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
  const matches = destinations.filter((destination) =>
    destination.aliases.some((alias) => words.includes(` ${alias} `)),
  );
  if (matches.length > 0) return matches.length === 1 ? matches[0]?.name : undefined;
  const matchedCountries = countries.filter((country) =>
    country.aliases.some((alias) => words.includes(` ${alias} `)),
  );
  return matchedCountries.length === 1 ? matchedCountries[0]?.name : undefined;
}
