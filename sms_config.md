# SMS Integration Configuration (PhilSMS)

This file contains the configuration credentials for integrating PhilSMS in the project.

## Credentials
- **API Token**: `2719|wMhlaNkvP9fHQaujRxdafxD6rmZIbahkC1andShK72ae7a42`
- **OAuth 2.0 API Endpoint**: `https://dashboard.philsms.com/api/v3/`
- **Sender ID**: `PhilSMS`

## Integration Reference

### Authentication
When making requests to the PhilSMS API, authorize the requests using the API token as a Bearer token in the request headers:

```http
Authorization: Bearer 2719|wMhlaNkvP9fHQaujRxdafxD6rmZIbahkC1andShK72ae7a42
Content-Type: application/json
Accept: application/json
```

### Potential Endpoints
Based on standard PhilSMS / SMS Gateway API integration structures, the endpoints typically take the following form:

- **Send SMS**: `POST https://dashboard.philsms.com/api/v3/send` or `POST https://dashboard.philsms.com/api/v3/sms/send`
- **Payload Example**:
  ```json
  {
    "recipient": "639XXXXXXXXX",
    "sender_id": "PhilSMS", // or your pre-registered Sender ID
    "message": "Your SMS message goes here."
  }
  ```

> [!NOTE]
> Make sure to reference this file whenever implementing the SMS-related notifications, OTPs, or alert systems.
