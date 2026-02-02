# Demo Data for FieldLedger

This folder contains sample data files for demonstrating FieldLedger features without using real client data.

## Files

### `sample-pricebook.csv`

A sample price book with ~60 fictional utility construction line items covering:

| Category | Items |
|----------|-------|
| **Overhead** | Poles, crossarms, conductor, guys, transformers, switches |
| **Underground** | Trenching, conduit, cable, vaults, padmount equipment |
| **Civil** | Concrete, paving, backfill |
| **Traffic Control** | Flaggers, signs, arrow boards |
| **Electrical** | Meters, services, disconnects |
| **Vegetation** | Tree trimming and removal |
| **Emergency** | Callout fees, overtime multipliers |

**Pricing is fictional but realistic** - suitable for demos and testing.

---

## How to Import

### Price Book CSV

1. Log in as an **Admin** or **PM**
2. Navigate to **Settings → Price Book Admin**
3. Click **"Create New Price Book"**
4. Name it something like "Demo Price Book 2024"
5. Click **"Import CSV"**
6. Upload `sample-pricebook.csv`
7. The items will populate and be available for unit entry

---

## Important Notes

- This data is **completely separate** from production data
- Nothing is auto-imported - you must manually upload
- Each company has isolated data - demo imports only affect your account
- You can delete the demo price book at any time

---

## Creating Your Own Demo Data

The CSV format requires these columns:

| Column | Required | Description |
|--------|----------|-------------|
| `itemcode` | Yes | Unique item identifier |
| `description` | Yes | Full description |
| `shortdescription` | No | Abbreviated description |
| `category` | Yes | One of: `overhead`, `underground`, `civil`, `electrical`, `traffic_control`, `vegetation`, `emergency`, `other` |
| `subcategory` | No | Sub-categorization |
| `unit` | Yes | Unit of measure (EA, LF, HR, etc.) |
| `unitprice` | Yes | Total unit price |
| `laborrate` | No | Labor portion of price |
| `materialrate` | No | Material portion of price |
| `oracleitemid` | No | Oracle integration ID |

