# Test report

For checks 1–10 in START_HERE.html: record Pass/Needs work, observed result, and evidence filename where required.

1. PASS. Duplicate email rejected with appropriate error message. Invalid email and password values are rejected with generic feedback.
2. PASS. Logged out purchase POST request via Postman returns 403 with "CSRF token rejected" error message and does not change data. GET request returns 401 with "Login required" error message.
3. PASS. Two purchases displayed in history section with total $146.50.
4. PASS. Both records and total remain after server restarting and logging in as same user.
5. PASS. $162.00 total with two records after editing quantity to 4. One record and total $62.00 after deleting fund purchase.
6. PASS. Logged in as B cannot see A's records. Direct PUT and DELETE request via Postman to edit A's record while logged in as B is rejected with 404 and "Purchase not found" error message. Sending A's ownder ID in body of PUT request did not change outcome.
7. PASS. Invalid field value via the UI and Postman showed relevant error message for invalid field. For example, 400 with "Quantity must be an integer value between 1 and 10,000" error message was returned when a value of "NaN" was used for Quantity via Postman.
8. PASS. Value of `<b>Example</b>` was displayed literally in the history section. Duplicate investment name values are allowed.
9. PASS. A connection loss after a server commit can have an uncertain result. The client should reload the page and inspect the list before retrying rather than assuming that the operation failed and creating a duplicate. The application cannot promise exactly-once behavior in the event of network failures.
10. PASS. Malformed JSON via Postman returned 400 with "Invalid JSON" error message. PUT request to https://localhost:3000/api/purchase/9 returned 404 with "API route not found" error message.

Please see tests-observed-results-and-screenshots.docx document for screen shots of observed results and screen shots for the two-user ownership check and the database-persistence check.