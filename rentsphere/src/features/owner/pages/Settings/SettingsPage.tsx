import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function SettingsPage() {
    const nav = useNavigate();

    useEffect(() => {
        nav("/owner/add-condo/step-0?mode=edit");
    }, [nav]);

    return null;
}
