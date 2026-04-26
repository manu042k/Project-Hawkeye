from Backend.agent.entrypoints.cli import main as agent_main


def main() -> int:
    return agent_main()


if __name__ == "__main__":
    raise SystemExit(main())
