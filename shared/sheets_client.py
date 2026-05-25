"""Shared Google Sheets client placeholder."""


class SheetsClient:
    def __init__(self, spreadsheet_id: str) -> None:
        self.spreadsheet_id = spreadsheet_id

    def append_rows(self, worksheet_name: str, rows: list[list[str]]) -> None:
        raise NotImplementedError("Implement Google Sheets append logic.")
