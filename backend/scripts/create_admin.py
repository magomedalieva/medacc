import argparse
import asyncio
import sys

from app.core.database import session_factory
from app.services.admin_access_service import AdminAccessService


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a MedAcc administrator account.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--first-name", required=True)
    parser.add_argument("--last-name", required=True)
    return parser.parse_args()


async def main() -> None:
    args = parse_args()

    async with session_factory() as session:
        await AdminAccessService(session).create_admin_account(
            email=args.email,
            password=args.password,
            first_name=args.first_name,
            last_name=args.last_name,
        )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exception:
        print(str(exception), file=sys.stderr)
        raise SystemExit(1)
